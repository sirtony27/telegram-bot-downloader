import "dotenv/config";

/**
 * Lee y valida todas las variables de entorno requeridas al arrancar.
 * Lanza un error descriptivo si alguna variable obligatoria falta.
 */

const REQUIRED_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "OWNER_CHAT_ID",
];

/**
 * Valida que todas las variables de entorno requeridas estén presentes.
 * @throws {Error} Si falta alguna variable de entorno obligatoria.
 */
function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `[config] Variables de entorno faltantes: ${missing.join(", ")}\n` +
        "Copiá .env.example a .env y completá los valores requeridos.",
    );
  }

  // Validar formato del token de Telegram
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token.includes(":") || token.length < 40) {
    throw new Error(
      `[config] TELEGRAM_BOT_TOKEN inválido. ` +
        "Debe tener el formato provisto por @BotFather: 123456789:AAA...",
    );
  }

  // Validar que OWNER_CHAT_ID sea numérico
  const ownerId = process.env.OWNER_CHAT_ID;
  if (!/^\d+$/.test(ownerId)) {
    throw new Error(
      `[config] OWNER_CHAT_ID inválido: "${ownerId}". ` +
        "Debe ser un número entero (tu Telegram User ID).",
    );
  }
}

validateEnv();

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSpaceSeparatedArgs(value) {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  /** Token del bot de Telegram (provisto por @BotFather) */
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,

  /** Telegram User ID del dueño — único usuario autorizado */
  ownerChatId: parseInt(process.env.OWNER_CHAT_ID, 10),



  /** Directorio donde se guardan los archivos temporales de descarga */
  tempDir: process.env.TEMP_DIR || "./temp",

  /** Tamaño máximo de archivo que yt-dlp puede descargar (en MB) */
  maxFileSizeMb: parseIntEnv(process.env.MAX_FILE_SIZE_MB || "50", 50),

  /**
   * Ruta opcional a un archivo Netscape cookies.txt para autenticar yt-dlp.
   * Requerido para YouTube e Instagram desde IPs de servidor.
   */
  cookiesFile: process.env.COOKIES_FILE || null,

  /**
   * Proxy opcional para yt-dlp (ej: socks5h://127.0.0.1:40000 con Cloudflare WARP en modo proxy).
   * No afecta SSH ni la conexión a Telegram — solo las descargas de yt-dlp.
   */
  ytdlpProxy: process.env.YTDLP_PROXY || null,

  /** Timeout para operaciones de yt-dlp (en milisegundos) */
  ytdlpTimeoutMs: parseIntEnv(process.env.YTDLP_TIMEOUT_MS || "120000", 120000),

  /** Cantidad de fragmentos concurrentes de yt-dlp (equivale a -N). */
  ytdlpConcurrency: parseIntEnv(process.env.YTDLP_CONCURRENCY || "16", 16),

  /** Tamaño de chunk HTTP (MB) para reducir throttling en ciertos proveedores. 0 desactiva. */
  ytdlpHttpChunkSizeMb: parseIntEnv(
    process.env.YTDLP_HTTP_CHUNK_SIZE_MB || "10",
    10,
  ),

  /** Downloader externo opcional (ej: aria2c) para acelerar descargas. */
  ytdlpExternalDownloader: process.env.YTDLP_EXTERNAL_DOWNLOADER || null,

  /** Args para downloader externo, separados por espacios. */
  ytdlpExternalDownloaderArgs: parseSpaceSeparatedArgs(
    process.env.YTDLP_EXTERNAL_DOWNLOADER_ARGS,
  ),

  /**
   * Límite de tamaño de archivos enviables por bots de Telegram (en bytes).
   * Los bots pueden enviar hasta 50 MB usando InputFile local.
   */
  telegramMaxBytes: 50 * 1024 * 1024,

  /** Puerto del servidor web (PWA + API). */
  webPort: parseIntEnv(process.env.WEB_PORT || "3000", 3000),

  /**
   * URL base pública del servidor web. Se usa para generar links de descarga.
   * Si no se define, el backend la deduce por request (host/proto), útil con proxy HTTPS.
   */
  webBaseUrl: process.env.WEB_BASE_URL?.trim() || null,
};
