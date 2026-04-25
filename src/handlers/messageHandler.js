import { isAuthorized } from "../utils/auth.js";
import { logger } from "../utils/logger.js";
import { handleDownload } from "./downloadHandler.js";
import {
  handleStaticSticker,
  handleDocumentSticker,
  handleStickerToWhatsapp,
} from "./stickerHandler.js";
import { formatHistoryMessage } from "./historyHandler.js";

/**
 * Router principal de mensajes entrantes para el bot de Telegram.
 * Registra todos los handlers necesarios en la instancia de grammy.
 */

/** Expresión regular para detectar URLs en texto */
const URL_REGEX = /https?:\/\/[^\s]+/i;

/** Menú de ayuda en texto plano */
const HELP_MENU = `¡Hola! Esto es lo que puedo hacer:

📥 Descargar videos
Enviame un enlace de TikTok, Instagram, YouTube, Twitter/X u otro sitio compatible.

🖼 Crear sticker para Telegram
Enviame una foto (como imagen o documento) para convertirla en sticker de Telegram.

👋 Convertir sticker para WhatsApp
Reenviame cualquier sticker de Telegram y te devuelvo el archivo .webp listo para importar en WhatsApp.

📋 Ver historial
Escribí /historial para ver tus últimas 10 descargas.

ℹ️ Ayuda
Escribí /help o /start para ver este mensaje.`;

/**
 * Middleware de autorización para grammy.
 * Rechaza cualquier mensaje de usuarios no autorizados antes de procesarlo.
 * @param {import('grammy').Context} ctx
 * @param {Function} next
 */
async function authMiddleware(ctx, next) {
  const chatId = ctx.from?.id;

  if (!isAuthorized(chatId)) {
    logger.warn("[messageHandler] Mensaje de usuario no autorizado rechazado.");
    await ctx.reply("No autorizado.").catch(() => {});
    return; // No llamar a next()
  }

  await next();
}

/**
 * Registra todos los handlers de mensajes en el bot de grammy.
 * @param {import('grammy').Bot} bot - Instancia del bot de grammy.
 */
export function registerHandlers(bot) {
  // Aplicar middleware de autorización a todos los mensajes
  bot.use(authMiddleware);

  // --- Comandos ---

  /** /start y /help → menú de ayuda */
  bot.command(["start", "help"], (ctx) => ctx.reply(HELP_MENU));

  /** /historial → últimas 10 descargas */
  bot.command("historial", async (ctx) => {
    const historyText = await formatHistoryMessage(10);
    await ctx.reply(historyText);
  });

  // --- Mensajes ---
  /**
   * Router único para evitar que múltiples handlers respondan al mismo update.
   * grammy ejecuta todos los handlers que matchean, por eso centralizamos el flujo.
   */
  bot.on("message", async (ctx) => {
    const msg = ctx.message;

    if (msg.photo) {
      await handleStaticSticker(ctx);
      return;
    }

    if (msg.document) {
      const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      const mimeType = msg.document.mime_type || "";

      if (imageTypes.includes(mimeType)) {
        await handleDocumentSticker(ctx);
      } else {
        await ctx.reply(
          "Solo proceso imágenes como documentos (JPEG, PNG, WEBP, GIF). " +
            "Para videos, enviame el enlace directamente.",
        );
      }
      return;
    }

    if (msg.sticker) {
      await handleStickerToWhatsapp(ctx);
      return;
    }

    if (msg.text) {
      const urlMatch = msg.text.match(URL_REGEX);
      if (urlMatch) {
        await handleDownload(ctx, urlMatch[0]);
        return;
      }
    }

    await ctx.reply(HELP_MENU);
  });

  logger.info("[messageHandler] Handlers registrados correctamente.");
}
