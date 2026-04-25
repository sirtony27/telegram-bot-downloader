import "dotenv/config";

/**
 * Lee y valida todas las variables de entorno requeridas al arrancar.
 * Lanza un error descriptivo si alguna variable obligatoria falta.
 */

const REQUIRED_VARS = [
  "TELEGRAM_BOT_TOKEN",
  "OWNER_CHAT_ID",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
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

export const config = {
  /** Token del bot de Telegram (provisto por @BotFather) */
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,

  /** Telegram User ID del dueño — único usuario autorizado */
  ownerChatId: parseInt(process.env.OWNER_CHAT_ID, 10),

  /** URL del proyecto en Supabase */
  supabaseUrl: process.env.SUPABASE_URL,

  /** Clave anon/public de Supabase */
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,

  /** Directorio donde se guardan los archivos temporales de descarga */
  tempDir: process.env.TEMP_DIR || "./temp",

  /** Tamaño máximo de archivo que yt-dlp puede descargar (en MB) */
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || "50", 10),

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
  ytdlpTimeoutMs: parseInt(process.env.YTDLP_TIMEOUT_MS || "120000", 10),

  /**
   * Límite de tamaño de archivos enviables por bots de Telegram (en bytes).
   * Los bots pueden enviar hasta 50 MB usando InputFile local.
   */
  telegramMaxBytes: 50 * 1024 * 1024,

  /** Puerto del servidor web (PWA + API). */
  webPort: parseInt(process.env.WEB_PORT || "3000", 10),

  /**
   * URL base pública del servidor web. Se usa para generar links de descarga.
   * Si no se define, el backend la deduce por request (host/proto), útil con proxy HTTPS.
   */
  webBaseUrl: process.env.WEB_BASE_URL?.trim() || null,
};
