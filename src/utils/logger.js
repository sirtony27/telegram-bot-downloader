/**
 * Logger simple con timestamp — sin dependencias externas.
 * Todos los mensajes incluyen fecha/hora ISO y nivel de severidad.
 */

const LEVELS = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
};

/**
 * Formatea y escribe un mensaje de log en stdout/stderr.
 * @param {'info'|'warn'|'error'|'debug'} level - Nivel de severidad.
 * @param {string} message - Mensaje principal.
 * @param {unknown} [extra] - Datos adicionales opcionales (objeto, error, etc.).
 */
function log(level, message, extra) {
  const timestamp = new Date().toISOString();
  const label = LEVELS[level] ?? 'LOG';
  const prefix = `[${timestamp}] [${label}]`;

  if (level === 'error') {
    if (extra instanceof Error) {
      console.error(`${prefix} ${message}`, extra.message);
      if (extra.stack) console.error(extra.stack);
    } else if (extra !== undefined) {
      console.error(`${prefix} ${message}`, extra);
    } else {
      console.error(`${prefix} ${message}`);
    }
  } else {
    if (extra !== undefined) {
      console.log(`${prefix} ${message}`, extra);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
}

export const logger = {
  /** @param {string} message @param {unknown} [extra] */
  info: (message, extra) => log('info', message, extra),

  /** @param {string} message @param {unknown} [extra] */
  warn: (message, extra) => log('warn', message, extra),

  /** @param {string} message @param {unknown} [extra] */
  error: (message, extra) => log('error', message, extra),

  /** @param {string} message @param {unknown} [extra] */
  debug: (message, extra) => log('debug', message, extra),
};
