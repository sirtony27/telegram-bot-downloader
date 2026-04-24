import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Handler de historial de descargas en Supabase.
 * Todas las operaciones manejan sus propios errores sin romper el flujo principal.
 */

/** @type {import('@supabase/supabase-js').SupabaseClient} */
const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

/**
 * Mapa de dominios conocidos a nombres de plataforma legibles.
 */
const PLATFORM_MAP = {
  'tiktok.com': 'TikTok',
  'instagram.com': 'Instagram',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'twitter.com': 'Twitter',
  'x.com': 'Twitter',
  'facebook.com': 'Facebook',
  'fb.watch': 'Facebook',
  'reddit.com': 'Reddit',
  'twitch.tv': 'Twitch',
  'vimeo.com': 'Vimeo',
  'dailymotion.com': 'Dailymotion',
  'pinterest.com': 'Pinterest',
};

/**
 * Extrae el nombre de la plataforma a partir de la URL.
 * @param {string} url - URL del video descargado.
 * @returns {string} Nombre de la plataforma o el dominio crudo si no es reconocido.
 */
export function extractPlatform(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const [domain, name] of Object.entries(PLATFORM_MAP)) {
      if (hostname.includes(domain)) return name;
    }
    return hostname;
  } catch {
    return 'Desconocido';
  }
}

/**
 * Registra una descarga exitosa en la tabla `downloads` de Supabase.
 * Los errores de Supabase se loggean pero no se propagan.
 * @param {{ url: string, platform: string, filename: string, filesizeMb: number }} params
 */
export async function logDownload({ url, platform, filename, filesizeMb }) {
  try {
    const { error } = await supabase.from('downloads').insert([
      {
        url,
        platform,
        filename,
        filesize_mb: filesizeMb,
      },
    ]);

    if (error) {
      logger.error('[historyHandler] Error al insertar en Supabase:', error);
    } else {
      logger.info(`[historyHandler] Descarga registrada: ${platform} — ${filename}`);
    }
  } catch (err) {
    logger.error('[historyHandler] Excepción al insertar en Supabase:', err);
  }
}

/**
 * Recupera los últimos N registros de descargas ordenados por fecha descendente.
 * @param {number} [limit=10] - Cantidad de registros a recuperar.
 * @returns {Promise<Array<{url: string, platform: string, filename: string, filesize_mb: number, created_at: string}>>}
 */
export async function getHistory(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('downloads')
      .select('url, platform, filename, filesize_mb, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('[historyHandler] Error al consultar historial en Supabase:', error);
      return [];
    }

    return data ?? [];
  } catch (err) {
    logger.error('[historyHandler] Excepción al consultar historial:', err);
    return [];
  }
}

/**
 * Formatea el historial de descargas como texto plano para enviar por Telegram.
 * @param {number} [limit=10] - Cantidad de registros a mostrar.
 * @returns {Promise<string>} Texto formateado con el historial.
 */
export async function formatHistoryMessage(limit = 10) {
  const records = await getHistory(limit);

  if (records.length === 0) {
    return 'No hay descargas registradas aún.';
  }

  const lines = records.map((r, i) => {
    const date = new Date(r.created_at).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const size = r.filesize_mb != null ? `${r.filesize_mb} MB` : 'N/A';
    return `${i + 1}. [${date}] ${r.platform} — ${r.filename} (${size})`;
  });

  return `Últimas ${records.length} descargas:\n\n${lines.join('\n')}`;
}
