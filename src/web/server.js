import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { mkdir, unlink, readdir, writeFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import archiver from "archiver";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { runYtDlp, withYtDlpPerformanceArgs } from "../utils/ytdlp.js";
import { convertToWhatsappAnimatedWebp } from "../utils/ffmpeg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "../../public");
export const WEB_TEMP_DIR = path.join(config.tempDir, "web");

/** Tiempo de vida de los archivos temporales (30 minutos) */
const TEMP_TTL_MS = 30 * 60 * 1000;

/** Multer: archivos en memoria, máx 10MB */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** Marca el archivo para eliminación automática después del TTL */
function scheduleDeletion(filePath) {
  setTimeout(() => unlink(filePath).catch(() => {}), TEMP_TTL_MS);
}

/** Crea un ZIP con varios archivos sin depender del comando del sistema. */
async function createZipArchive(zipPath, filePaths) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    for (const filePath of filePaths) {
      archive.file(filePath, { name: path.basename(filePath) });
    }

    try {
      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

/** Construye una URL pública para un archivo temporal. */
function buildPublicFileUrl(req, filename) {
  const safeFilename = encodeURIComponent(filename);

  if (config.webBaseUrl) {
    const normalizedBase = config.webBaseUrl.replace(/\/+$/, "");
    return `${normalizedBase}/files/${safeFilename}`;
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "http";
  return `${proto}://${req.get("host")}/files/${safeFilename}`;
}

/** Timestamp de inicio del servidor */
const START_TIME = Date.now();

/**
 * Crea y arranca el servidor Express (PWA + API).
 * @param {() => (string | undefined)} getBotUsername - Getter del username del bot.
 * @returns {Promise<import('express').Express>}
 */
export async function createWebServer(getBotUsername = () => undefined) {
  await mkdir(WEB_TEMP_DIR, { recursive: true });

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());

  // Archivos estáticos: PWA
  app.use(express.static(PUBLIC_DIR));

  // Archivos temporales (descargas convertidas)
  app.use("/files", express.static(WEB_TEMP_DIR));

  // ─── API ──────────────────────────────────────────────────────────────────

  const progressClients = new Map();

  app.get("/api/progress/:clientId", (req, res) => {
    const { clientId } = req.params;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Evita que NGINX o proxies retengan los eventos
    });

    // Enviar un ping inicial para abrir el stream de inmediato
    res.write(`data: {"connected": true}\n\n`);

    const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const heartbeat = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);

    progressClients.set(clientId, sendEvent);

    req.on("close", () => {
      clearInterval(heartbeat);
      progressClients.delete(clientId);
    });
  });

  /** Estado del bot */
  app.get("/api/status", (_req, res) => {
    const botUsername = getBotUsername();

    res.json({
      online: true,
      botUsername: botUsername ?? "desconocido",
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
    });
  });


  /** Analizar un link para extraer calidades */
  app.post("/api/info", async (req, res) => {
    const { url } = req.body ?? {};
    if (!url)
      return res.status(400).json({ success: false, error: "URL requerida" });
    try {
      const infoArgs = [
        "--dump-json",
        "--no-playlist",
        "--js-runtimes",
        "node",
      ];
      if (config.cookiesFile) infoArgs.push("--cookies", config.cookiesFile);
      if (config.ytdlpProxy) infoArgs.push("--proxy", config.ytdlpProxy);
      if (url.includes("tiktok.com")) {
        infoArgs.push(
          "--extractor-args",
          "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;app_info=7355728"
        );
      }
      infoArgs.push(url);

      const infoOut = await runYtDlp(infoArgs);
      const info = JSON.parse(infoOut.trim().split("\n")[0]);

      const formats = [];
      if (info.formats) {
        const added = new Set();
        // Recorrer de atrás hacia adelante (mejores resoluciones primero)
        for (const f of info.formats.reverse()) {
          if (f.height && f.height >= 144 && !added.has(f.height)) {
            added.add(f.height);
            formats.push({
              format_id: `bestvideo[height<=${f.height}]+bestaudio/best`,
              resolution: `${f.height}p`,
              ext: "mp4",
              fps: Math.round(f.fps || 30),
            });
          }
        }
      }
      res.json({
        success: true,
        info: { title: info.title, thumbnail: info.thumbnail, formats },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err.message.split("\n").slice(-3).join(" "),
      });
    }
  });

  /** Descarga un video por URL y Formato */
  app.post("/api/download", async (req, res) => {
    const { url, format, clientId } = req.body ?? {};
    if (!url)
      return res.status(400).json({ success: false, error: "URL requerida" });

    const uuid = randomUUID();
    const outputTemplate = path.join(WEB_TEMP_DIR, `${uuid}.%(ext)s`);

    try {
      let formatArg =
        "best[height<=1080][ext=mp4]/bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best";

      if (format === "audio") {
        formatArg = "bestaudio/best";
      } else if (format && format !== "best") {
        formatArg = format;
      }

      const args = [
        "--playlist-end",
        "15", // Límite de seguridad
        "--max-filesize",
        `${config.maxFileSizeMb}M`,
        "--js-runtimes",
        "node",
        "-f",
        formatArg,
        "-o",
        outputTemplate,
      ];

      if (format === "audio") {
        args.push("-x", "--audio-format", "mp3");
      } else {
        args.push("--merge-output-format", "mp4");
      }

      if (config.cookiesFile) args.push("--cookies", config.cookiesFile);
      if (config.ytdlpProxy) args.push("--proxy", config.ytdlpProxy);
      if (url.includes("tiktok.com")) {
        args.push(
          "--extractor-args",
          "tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;app_info=7355728"
        );
      }
      args.push("--no-color"); // Evitar ANSI color codes en el stdout
      args.push(url);

      const finalArgs = withYtDlpPerformanceArgs(args);

      // Descarga real con progreso SSE
      const onProgress = (dataStr) => {
        if (clientId && progressClients.has(clientId)) {
          const matches = [...dataStr.matchAll(/\[download\]\s+([\d\.]+)%/g)];
          if (matches.length > 0) {
            progressClients.get(clientId)({
              percent: matches[matches.length - 1][1],
            });
          }
        }
      };

      await runYtDlp(finalArgs, config.ytdlpTimeoutMs, onProgress);

      if (clientId && progressClients.has(clientId)) {
        progressClients.get(clientId)({ percent: "100", done: true });
      }

      // Encontrar los archivos descargados con el UUID
      const files = await readdir(WEB_TEMP_DIR);
      const matchFiles = files.filter((f) => f.startsWith(uuid));
      if (matchFiles.length === 0)
        throw new Error("No se encontró el archivo descargado.");

      let finalFilename = matchFiles[0];

      // Si hay múltiples archivos (Playlist), los zipeamos
      if (matchFiles.length > 1) {
        finalFilename = `${uuid}.zip`;
        const zipPath = path.join(WEB_TEMP_DIR, finalFilename);
        const filePaths = matchFiles.map((f) => path.join(WEB_TEMP_DIR, f));

        await createZipArchive(zipPath, filePaths);

        // Borrar los originales
        for (const fp of filePaths) unlink(fp).catch(() => {});
      }

      const filePath = path.join(WEB_TEMP_DIR, finalFilename);
      scheduleDeletion(filePath);

      const platform = extractPlatform(url);

      // Registrar historial de manera asíncrona
      logDownload({
        url,
        platform,
        filename: finalFilename,
        filesizeMb: null,
      }).catch(() => {});

      res.json({
        success: true,
        downloadUrl: buildPublicFileUrl(req, finalFilename),
        filename: finalFilename,
        platform,
      });
    } catch (err) {
      logger.error("[web/download] Error:", err.message);
      res.status(500).json({
        success: false,
        error: err.message.split("\n").slice(-3).join(" "),
      });
    }
  });

  /** Convierte una imagen o video a sticker para Telegram o WhatsApp */
  app.post("/api/sticker", upload.single("image"), async (req, res) => {
    const type = req.body?.type ?? "whatsapp"; // 'telegram' | 'whatsapp'

    if (!req.file)
      return res
        .status(400)
        .json({ success: false, error: "Archivo requerido" });

    try {
      const uuid = randomUUID();
      const isVideo = req.file.mimetype.startsWith("video/");
      const suffix = type === "telegram" ? "_tg.webp" : "_wa.webp";
      const filename = `${uuid}${suffix}`;
      const filePath = path.join(WEB_TEMP_DIR, filename);

      if (isVideo) {
        // Video: Guardar buffer en disco y procesar con ffmpeg
        const tempVideo = path.join(WEB_TEMP_DIR, `${uuid}_temp.mp4`);
        await writeFile(tempVideo, req.file.buffer);

        try {
          // Actualmente solo soportamos conversión de video a WebP animado para WhatsApp.
          // Para telegram habría que hacer convertVideoToStickerWebm. Como UX pide WhatsApp, forzamos esto:
          await convertToWhatsappAnimatedWebp(tempVideo, filePath);
        } finally {
          unlink(tempVideo).catch(() => {});
        }
      } else {
        // Imagen estática: Procesar con sharp en memoria
        const maxKb = type === "telegram" ? Infinity : 100;
        let buffer = await sharp(req.file.buffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();

        if (buffer.length > maxKb * 1024) {
          buffer = await sharp(req.file.buffer)
            .resize(512, 512, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 50 })
            .toBuffer();
        }
        await writeFile(filePath, buffer);
      }

      scheduleDeletion(filePath);
      const finalStats = await stat(filePath);

      res.json({
        success: true,
        downloadUrl: buildPublicFileUrl(req, filename),
        sizeKb: Math.round(finalStats.size / 1024),
      });
    } catch (err) {
      logger.error("[web/sticker] Error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** Limpiar caché manual */
  app.post("/api/clear-temp", async (_req, res) => {
    try {
      const files = await readdir(WEB_TEMP_DIR);
      let freedBytes = 0;
      for (const file of files) {
        const filePath = path.join(WEB_TEMP_DIR, file);
        try {
          const stats = await stat(filePath);
          freedBytes += stats.size;
          await unlink(filePath);
        } catch {
          /* ignore if deleted */
        }
      }
      res.json({
        success: true,
        freedMb: (freedBytes / 1024 / 1024).toFixed(2),
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SPA fallback (compatible con Express 5 / path-to-regexp v8+)
  app.use((_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

  // ─── Start ────────────────────────────────────────────────────────────────
  app.listen(config.webPort, "0.0.0.0", () => {
    const publicBase = config.webBaseUrl || "(auto) https?://<host>";
    logger.info(
      `[web] Servidor PWA en ${publicBase} (puerto ${config.webPort})`,
    );
  });

  // --- Garbage Collection de temporales (cada 1 hora) ---
  const cleanupTempFiles = async () => {
    try {
      const files = await readdir(WEB_TEMP_DIR);
      const now = Date.now();
      let count = 0;
      for (const file of files) {
        const filePath = path.join(WEB_TEMP_DIR, file);
        try {
          const stats = await stat(filePath);
          if (now - stats.mtimeMs > 3600000) {
            // 1 hora
            await unlink(filePath);
            count++;
          }
        } catch {
          /* ignore */
        }
      }
      if (count > 0)
        logger.info(
          `[web/cleanup] Eliminados ${count} archivos temporales antiguos.`,
        );
    } catch (err) {
      logger.error("[web/cleanup] Error:", err.message);
    }
  };
  setInterval(cleanupTempFiles, 3600000);
  setTimeout(cleanupTempFiles, 10000); // Ejecutar limpieza inicial a los 10s de arrancar

  return app;
}
