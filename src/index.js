import { mkdir } from 'node:fs/promises';
import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { registerHandlers } from './handlers/messageHandler.js';
import { createWebServer } from './web/server.js';

/**
 * Entry point del bot de Telegram.
 * Inicia grammy en modo long polling, registra handlers y gestiona errores globales.
 */

/**
 * Inicializa y arranca el bot de Telegram.
 * @returns {Promise<void>}
 */
async function startBot() {
  // Asegurar que el directorio de temporales exista
  await mkdir(config.tempDir, { recursive: true });

  const bot = new Bot(config.telegramToken);

  // Registrar todos los handlers de mensajes
  registerHandlers(bot);

  // --- Manejo global de errores de grammy ---
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error(`[index] Error procesando update ${ctx.update.update_id}:`);

    if (err.error instanceof GrammyError) {
      // Error de la API de Telegram (ej: mensaje demasiado largo, bot bloqueado)
      logger.error('[index] GrammyError:', err.error.description);
    } else if (err.error instanceof HttpError) {
      // Error de red al comunicarse con Telegram
      logger.error('[index] HttpError:', err.error);
    } else {
      logger.error('[index] Error desconocido:', err.error);
    }

    // Intentar notificar al usuario sin propagar el error
    ctx.reply('⚠️ Ocurrió un error inesperado. Por favor intentá de nuevo.').catch(() => {});
  });

  // Configurar comandos visibles en el menú de Telegram
  await bot.api.setMyCommands([
    { command: 'start',     description: 'Ver menú de ayuda' },
    { command: 'help',      description: 'Ver menú de ayuda' },
    { command: 'historial', description: 'Ver las últimas 10 descargas' },
  ]);

  // Arrancar long polling
  let botInfo;
  bot.start({
    onStart: (info) => {
      botInfo = info;
      logger.info(`[index] Bot iniciado: @${info.username}`);
      logger.info(`[index] Usuario autorizado ID: ${config.ownerChatId}`);
      logger.info('[index] Escuchando mensajes... (Ctrl+C para detener)');
    },
  });

  // Arrancar servidor web (PWA + API) en paralelo
  createWebServer(botInfo).catch(err => {
    logger.error('[index] Error al iniciar servidor web:', err);
  });
}

// --- Arranque ---
startBot().catch((err) => {
  logger.error('[index] Error fatal al iniciar el bot:', err);
  process.exit(1);
});

// Manejo de señales del sistema para shutdown limpio
process.on('SIGINT', () => {
  logger.info('[index] Recibida señal SIGINT. Cerrando bot...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('[index] Recibida señal SIGTERM. Cerrando bot...');
  process.exit(0);
});

// Capturar promesas sin catch
process.on('unhandledRejection', (reason) => {
  logger.error('[index] Promesa no manejada:', reason);
});
