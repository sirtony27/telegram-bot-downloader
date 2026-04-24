import { config } from '../config.js';

/**
 * Verifica si el remitente de un mensaje está autorizado para usar el bot.
 * Solo el usuario con el Telegram User ID definido en OWNER_CHAT_ID puede interactuar.
 */

/**
 * Comprueba si el chat ID del remitente coincide con el del dueño.
 * @param {number | undefined} chatId - Telegram User ID del remitente.
 * @returns {boolean} `true` si el remitente está autorizado.
 */
export function isAuthorized(chatId) {
  if (chatId === undefined || chatId === null) return false;
  return chatId === config.ownerChatId;
}
