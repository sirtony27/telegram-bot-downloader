import { stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { InputFile } from 'grammy';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { runYtDlp } from '../utils/ytdlp.js';
import { logDownload, extractPlatform } from './historyHandler.js';

/**
 * Handler de descarga de videos usando yt-dlp para Telegram.
 * Soporta TikTok, Instagram, YouTube, Twitter/X y cualquier sitio compatible con yt-dlp.
 */

/**
 * Detecta si la URL es de YouTube.
 * @param {string} url
 * @returns {boolean}
 */
function isYouTube(url) {
  try {
    const h = new URL(url).hostname;
    return h.includes('youtube.com') || h.includes('youtu.be');
  } catch {
    return false;
  }
}

/**
 * Detecta si la URL es de TikTok para aplicar flags especiales.
 * @param {string} url
 * @returns {boolean}
 */
function isTikTok(url) {
  try {
    return new URL(url).hostname.includes('tiktok.com');
  } catch {
    return false;
  }
}

/**
 * Detecta si la URL es de Instagram.
 * @param {string} url
 * @returns {boolean}
 */
function isInstagram(url) {
  try {
    return new URL(url).hostname.includes('instagram.com');
  } catch {
    return false;
  }
}

/**
 * Descarga un video desde la URL dada, lo envía al usuario y lo registra en Supabase.
 * @param {import('grammy').Context} ctx - Contexto de grammy.
 * @param {string} url - URL del video a descargar.
 * @returns {Promise<void>}
 */
export async function handleDownload(ctx, url) {
  const timestamp = Date.now();
  const outputTemplate = path.join(config.tempDir, `${timestamp}_%(id)s.%(ext)s`);

  // Construir args de yt-dlp
  const ytdlpArgs = [
    '--no-playlist',
    '--max-filesize', `${config.maxFileSizeMb}M`,
    '-o', outputTemplate,
    // Selector de formato con fallback progresivo
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
    '--no-warnings',
    '--print', 'filename',
    '--no-simulate',
    // Usar Node.js como JS runtime (ya instalado en el servidor)
    '--js-runtimes', 'node',
  ];

  // Flags especiales según plataforma
  if (isYouTube(url)) {
    // Usar cliente Android + TV: evita el bloqueo de IPs de servidor sin necesitar cookies válidas.
    // YouTube rota las cookies automáticamente, haciendo que el método de cookies sea poco confiable.
    ytdlpArgs.push('--extractor-args', 'youtube:player_client=android,tv_embedded');
  }
  if (isTikTok(url)) {
    ytdlpArgs.push('--extractor-args', 'tiktok:app_name=tiktok_web');
  }
  if (isInstagram(url)) {
    ytdlpArgs.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  }

  // Pasar cookies si están configuradas (útil para Instagram y sitios que requieren login)
  if (config.cookiesFile) {
    ytdlpArgs.push('--cookies', config.cookiesFile);
  }

  // Usar proxy si está configurado (ej: Cloudflare WARP en modo proxy → socks5h://127.0.0.1:40000)
  // Solo afecta a las descargas de yt-dlp, no a SSH ni a Telegram.
  if (config.ytdlpProxy) {
    ytdlpArgs.push('--proxy', config.ytdlpProxy);
  }

  ytdlpArgs.push(url);


  let filePath = null;
  let statusMsgId = null;

  try {
    // Enviar mensaje de estado y guardar su ID para borrarlo después
    const statusMsg = await ctx.reply('⏬ Descargando... esperá un momento.');
    statusMsgId = statusMsg.message_id;

    logger.info(`[downloadHandler] Iniciando descarga: ${url}`);

    const stdout = await runYtDlp(ytdlpArgs);
    const printedPath = stdout.trim().split('\n').pop()?.trim();
    filePath = printedPath || null;

    if (!filePath) {
      throw new Error('yt-dlp no reportó la ruta del archivo descargado.');
    }

    const fileStats = await stat(filePath);
    const fileSizeBytes = fileStats.size;
    const fileSizeMb = parseFloat((fileSizeBytes / (1024 * 1024)).toFixed(2));

    logger.info(`[downloadHandler] Archivo descargado: ${filePath} (${fileSizeMb} MB)`);

    // Verificar límite de Telegram para bots (50 MB)
    if (fileSizeBytes > config.telegramMaxBytes) {
      await ctx.reply(
        `❌ El archivo pesa ${fileSizeMb} MB y supera el límite de 50 MB de Telegram. No se puede enviar.`
      );
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.mkv', '.webm', '.mov', '.avi'].includes(ext);
    const isAudio = ['.mp3', '.m4a', '.ogg', '.opus', '.flac', '.wav'].includes(ext);

    const filename = path.basename(filePath);
    const platform = extractPlatform(url);
    const caption = `📥 ${platform}`;

    // Enviar el archivo con InputFile local (soporta hasta 50 MB sin re-upload)
    if (isVideo) {
      await ctx.replyWithVideo(new InputFile(filePath), { caption });
    } else if (isAudio) {
      await ctx.replyWithAudio(new InputFile(filePath), { caption });
    } else {
      await ctx.replyWithDocument(new InputFile(filePath), {
        caption,
        // Forzar nombre de archivo legible
        // grammy lo toma del InputFile automáticamente
      });
    }

    logger.info(`[downloadHandler] Archivo enviado: ${filename}`);
    await logDownload({ url, platform, filename, filesizeMb: fileSizeMb });

  } catch (err) {
    logger.error('[downloadHandler] Error durante la descarga:', err);

    let userMessage = '❌ Ocurrió un error al descargar el video.';

    if (err.message.includes('timeout') || err.message.includes('Timeout')) {
      userMessage = '⏱ La descarga tardó demasiado y fue cancelada. Intentá con otro video.';
    } else if (err.message.includes('max-filesize') || err.message.includes('File is too large')) {
      userMessage = `❌ El video supera el límite de ${config.maxFileSizeMb} MB y no se puede descargar.`;
    } else if (err.message.includes('Sign in') || err.message.includes('login required') || err.message.includes('cookies')) {
      userMessage = '🔐 Este sitio requiere autenticación para descargar desde servidores. Configurá el archivo de cookies (COOKIES_FILE en .env).';
    } else if (err.message.includes('yt-dlp falló')) {
      userMessage = '❌ No se pudo descargar el video. Verificá que la URL sea válida y que el contenido sea público.';
    } else if (err.message.includes('No se pudo iniciar yt-dlp')) {
      userMessage = '⚠️ yt-dlp no está instalado en el servidor.';
    }

    await ctx.reply(userMessage).catch(() => {});
  } finally {
    // Borrar mensaje de estado
    if (statusMsgId) {
      ctx.api.deleteMessage(ctx.chat.id, statusMsgId).catch(() => {});
    }
    // Limpiar archivo temporal siempre
    if (filePath) {
      unlink(filePath).catch((e) =>
        logger.warn(`[downloadHandler] No se pudo eliminar el temporal ${filePath}:`, e.message)
      );
    }
  }
}
