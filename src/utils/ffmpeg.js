import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Wrapper de ffmpeg usando child_process.execFile.
 * Expone funciones especializadas para conversión de media a formatos de sticker de Telegram.
 *
 * Stickers en Telegram:
 * - Estático:  .webp, exactamente 512×512 px (un lado debe ser 512, el otro ≤ 512)
 * - Animado:   .webm con codec VP9, sin audio, max 3 segundos, max 512×512 px
 */

/**
 * Ejecuta ffmpeg con los argumentos dados.
 * @param {string[]} args - Argumentos para pasar a ffmpeg.
 * @param {number} [timeoutMs=60000] - Timeout en ms.
 * @returns {Promise<void>} Resuelve cuando ffmpeg termina exitosamente.
 * @throws {Error} Si ffmpeg falla o supera el timeout.
 */
export function runFfmpeg(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const child = execFile('ffmpeg', args, { timeout: 0 }, (error, _stdout, stderr) => {
      if (timedOut) return;

      if (error) {
        const detail = stderr?.trim().split('\n').slice(-3).join(' ') || error.message;
        reject(new Error(`ffmpeg falló: ${detail}`));
        return;
      }

      resolve();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
      reject(new Error(`ffmpeg superó el timeout de ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', () => clearTimeout(timer));
    child.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) {
        reject(new Error(`No se pudo iniciar ffmpeg: ${err.message}. ¿Está instalado en el sistema?`));
      }
    });

    logger.debug(`[ffmpeg] Ejecutando con args: ${args.slice(0, 4).join(' ')}...`);
  });
}

/**
 * Convierte un archivo de video/webp animado en un sticker WebM animado compatible con Telegram.
 * Specs: VP9, sin audio, max 3 segundos, 512×512 con padding transparente.
 * @param {string} inputPath - Ruta al archivo de entrada (webp animado, gif, mp4, etc.).
 * @param {string} outputPath - Ruta de salida para el .webm resultante.
 * @returns {Promise<void>}
 * @throws {Error} Si la conversión falla.
 */
export async function convertToAnimatedStickerWebm(inputPath, outputPath) {
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-t', '3',                        // Máximo 3 segundos (límite Telegram)
    '-vf',
    // Escalar manteniendo aspect ratio, centrar con padding transparente en 512×512
    'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=30',
    '-c:v', 'libvpx-vp9',            // Codec VP9 requerido por Telegram
    '-pix_fmt', 'yuva420p',           // Con canal alpha (transparencia)
    '-b:v', '256k',
    '-crf', '10',
    '-an',                            // Sin audio
    '-loop', '0',
    outputPath,
  ]);
}

/**
 * Convierte un video descargado (mp4, webm) en un sticker WebM VP9 para Telegram.
 * @param {string} inputPath - Ruta al video de entrada.
 * @param {string} outputPath - Ruta de salida para el .webm resultante.
 * @returns {Promise<void>}
 */
export async function convertVideoToStickerWebm(inputPath, outputPath) {
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-t', '3',
    '-vf',
    'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=30',
    '-c:v', 'libvpx-vp9',
    '-pix_fmt', 'yuva420p',
    '-b:v', '256k',
    '-crf', '10',
    '-an',
    outputPath,
  ]);
}

/**
 * Convierte un WebM (sticker de video de Telegram) en un WebP animado compatible con WhatsApp.
 * Specs WhatsApp: 512×512, max 500KB, max 6 segundos, transparencia, loop infinito.
 * @param {string} inputPath - Ruta al archivo de entrada (WebM, GIF, MP4, etc.).
 * @param {string} outputPath - Ruta de salida para el .webp animado.
 * @param {number} [quality=70] - Calidad del WebP (0-100). Reducir si el archivo es muy grande.
 * @returns {Promise<void>}
 */
export async function convertToWhatsappAnimatedWebp(inputPath, outputPath, quality = 70) {
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-t', '6',                             // Máximo 6 segundos (límite WhatsApp)
    '-vf',
    // Escalar 512×512 con padding transparente, 15fps para reducir tamaño
    'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15',
    '-c:v', 'libwebp',                     // Encoder WebP animado
    '-loop', '0',                          // Loop infinito
    '-quality', String(quality),           // Calidad ajustable
    '-an',                                 // Sin audio
    outputPath,
  ]);
}
