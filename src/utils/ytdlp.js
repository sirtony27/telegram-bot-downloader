import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Wrapper de yt-dlp usando child_process.execFile para evitar inyección de shell.
 * Expone una API basada en Promises con timeout configurable.
 */

/**
 * Ejecuta yt-dlp con los argumentos dados y retorna la salida stdout.
 * @param {string[]} args - Argumentos para pasar a yt-dlp.
 * @param {number} [timeoutMs] - Timeout en ms (por defecto usa config.ytdlpTimeoutMs).
 * @returns {Promise<string>} stdout del proceso yt-dlp.
 * @throws {Error} Si yt-dlp falla, es cancelado por timeout, o el proceso termina con error.
 */
export function runYtDlp(args, timeoutMs = config.ytdlpTimeoutMs, onProgress = null) {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const child = execFile('yt-dlp', args, { timeout: 0 }, (error, stdout, stderr) => {
      if (timedOut) return; // Ya fue rechazado por el timeout

      if (error) {
        // yt-dlp escribe errores descriptivos en stderr
        const detail = stderr?.trim() || error.message;
        reject(new Error(`yt-dlp falló: ${detail}`));
        return;
      }

      resolve(stdout);
    });

    if (onProgress && child.stdout) {
      child.stdout.on('data', (data) => {
        onProgress(data.toString());
      });
    }

    // Implementar timeout manualmente para poder matar el proceso hijo
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Forzar SIGKILL si no termina en 5 segundos adicionales
      setTimeout(() => child.kill('SIGKILL'), 5000);
      reject(new Error(`yt-dlp superó el timeout de ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', () => clearTimeout(timer));
    child.on('error', (err) => {
      clearTimeout(timer);
      if (!timedOut) {
        reject(new Error(`No se pudo iniciar yt-dlp: ${err.message}. ¿Está instalado en el sistema?`));
      }
    });

    logger.debug(`[ytdlp] Ejecutando con args: ${args.slice(0, 3).join(' ')}...`);
  });
}

/**
 * Obtiene información de un video (JSON) sin descargarlo.
 * @param {string} url - URL del video.
 * @returns {Promise<object>} Objeto con la metadata del video.
 * @throws {Error} Si no se puede obtener la información.
 */
export async function getVideoInfo(url) {
  const stdout = await runYtDlp([
    '--dump-json',
    '--no-playlist',
    url,
  ]);

  try {
    return JSON.parse(stdout.trim().split('\n')[0]);
  } catch {
    throw new Error('No se pudo parsear la información del video.');
  }
}
