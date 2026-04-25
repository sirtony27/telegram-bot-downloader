import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, unlink, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runYtDlp } from '../utils/ytdlp.js';
import { getHistory, extractPlatform, logDownload } from '../handlers/historyHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../public');
export const WEB_TEMP_DIR = path.join(config.tempDir, 'web');

/** Tiempo de vida de los archivos temporales (30 minutos) */
const TEMP_TTL_MS = 30 * 60 * 1000;

/** Multer: archivos en memoria, máx 10MB */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** Marca el archivo para eliminación automática después del TTL */
function scheduleDeletion(filePath) {
  setTimeout(() => unlink(filePath).catch(() => {}), TEMP_TTL_MS);
}

/** Construye una URL pública para un archivo temporal */
function fileUrl(filename) {
  return `${config.webBaseUrl}/files/${filename}`;
}

/** Timestamp de inicio del servidor */
const START_TIME = Date.now();

/**
 * Crea y arranca el servidor Express (PWA + API).
 * @param {{ username: string }} botInfo - Info del bot de Telegram.
 * @returns {Promise<import('express').Express>}
 */
export async function createWebServer(botInfo) {
  await mkdir(WEB_TEMP_DIR, { recursive: true });

  const app = express();
  app.use(express.json());

  // Archivos estáticos: PWA
  app.use(express.static(PUBLIC_DIR));

  // Archivos temporales (descargas convertidas)
  app.use('/files', express.static(WEB_TEMP_DIR));

  // ─── API ──────────────────────────────────────────────────────────────────

  /** Estado del bot */
  app.get('/api/status', (_req, res) => {
    res.json({
      online: true,
      botUsername: botInfo?.username ?? 'desconocido',
      uptime: Math.floor((Date.now() - START_TIME) / 1000),
    });
  });

  /** Historial de descargas */
  app.get('/api/history', async (_req, res) => {
    const items = await getHistory(30);
    res.json({ success: true, items });
  });

  /** Descarga un video por URL */
  app.post('/api/download', async (req, res) => {
    const { url } = req.body ?? {};
    if (!url) return res.status(400).json({ success: false, error: 'URL requerida' });

    const uuid = randomUUID();
    const outputTemplate = path.join(WEB_TEMP_DIR, `${uuid}.%(ext)s`);

    try {
      const args = [
        '--no-playlist',
        '--max-filesize', `${config.maxFileSizeMb}M`,
        '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best',
        '--merge-output-format', 'mp4',
        '-o', outputTemplate,
      ];

      if (config.cookiesFile) args.push('--cookies', config.cookiesFile);
      if (config.ytdlpProxy)  args.push('--proxy', config.ytdlpProxy);
      args.push(url);

      // Obtener metadata del video (título, duración) antes de descargar
      let title = 'Video';
      let thumbnailUrl = null;
      try {
        const infoArgs = ['--dump-json', '--no-playlist'];
        if (config.ytdlpProxy) infoArgs.push('--proxy', config.ytdlpProxy);
        infoArgs.push(url);
        const infoOut = await runYtDlp(infoArgs);
        const info = JSON.parse(infoOut.trim().split('\n')[0]);
        title = info.title ?? 'Video';
        thumbnailUrl = info.thumbnail ?? null;
      } catch { /* no bloquear si falla info */ }

      await runYtDlp(args);

      // Encontrar el archivo descargado con el UUID como prefijo
      const files = await readdir(WEB_TEMP_DIR);
      const filename = files.find(f => f.startsWith(uuid));
      if (!filename) throw new Error('No se encontró el archivo descargado.');

      const filePath = path.join(WEB_TEMP_DIR, filename);
      scheduleDeletion(filePath);

      const platform = extractPlatform(url);

      // Registrar en Supabase
      logDownload({ url, platform, filename, filesizeMb: null }).catch(() => {});

      res.json({ success: true, downloadUrl: fileUrl(filename), filename, title, platform, thumbnailUrl });
    } catch (err) {
      logger.error('[web/download] Error:', err.message);
      res.status(500).json({ success: false, error: err.message.split('\n').slice(-3).join(' ') });
    }
  });

  /** Convierte una imagen a sticker para Telegram o WhatsApp */
  app.post('/api/sticker', upload.single('image'), async (req, res) => {
    const type = req.body?.type ?? 'whatsapp'; // 'telegram' | 'whatsapp'

    if (!req.file) return res.status(400).json({ success: false, error: 'Imagen requerida' });

    try {
      const uuid = randomUUID();
      const maxKb = type === 'telegram' ? Infinity : 100;
      const suffix = type === 'telegram' ? '_tg.webp' : '_wa.webp';

      let buffer = await sharp(req.file.buffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();

      // Reducir calidad si supera el límite de WhatsApp (100KB)
      if (buffer.length > maxKb * 1024) {
        buffer = await sharp(req.file.buffer)
          .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .webp({ quality: 50 })
          .toBuffer();
      }

      const filename = `${uuid}${suffix}`;
      const filePath = path.join(WEB_TEMP_DIR, filename);
      await writeFile(filePath, buffer);
      scheduleDeletion(filePath);

      res.json({ success: true, downloadUrl: fileUrl(filename), sizeKb: Math.round(buffer.length / 1024) });
    } catch (err) {
      logger.error('[web/sticker] Error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SPA fallback (compatible con Express 5 / path-to-regexp v8+)
  app.use((_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  // ─── Start ────────────────────────────────────────────────────────────────
  app.listen(config.webPort, '0.0.0.0', () => {
    logger.info(`[web] Servidor PWA en ${config.webBaseUrl} (puerto ${config.webPort})`);
  });

  return app;
}
