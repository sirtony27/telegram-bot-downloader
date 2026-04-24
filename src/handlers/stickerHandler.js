import { writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { InputFile } from 'grammy';
import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { convertToAnimatedStickerWebm } from '../utils/ffmpeg.js';

/**
 * Handler de stickers para Telegram.
 *
 * Formatos de sticker en Telegram:
 * - Estático:  .webp, 512×512 px (un lado exactamente 512, el otro ≤ 512)
 * - Animado:   .webm con codec VP9, sin audio, máximo 3 segundos, máximo 512×512 px
 *
 * @see https://core.telegram.org/stickers
 */

/**
 * Descarga el archivo de un mensaje de Telegram dado su file_id.
 * @param {import('grammy').Context} ctx - Contexto de grammy.
 * @param {string} fileId - ID del archivo en Telegram.
 * @returns {Promise<Buffer>} Buffer con el contenido del archivo.
 * @throws {Error} Si no se puede obtener o descargar el archivo.
 */
async function downloadTelegramFile(ctx, fileId) {
  const file = await ctx.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error('Telegram no devolvió la ruta del archivo.');
  }

  const fileUrl = `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo de Telegram: HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Convierte una foto recibida en Telegram en un sticker estático WebP compatible.
 * Toma la versión de mayor resolución disponible.
 * @param {import('grammy').Context} ctx - Contexto de grammy.
 * @returns {Promise<void>}
 */
export async function handleStaticSticker(ctx) {
  try {
    logger.info('[stickerHandler] Convirtiendo imagen a sticker estático...');

    const photo = ctx.message?.photo;
    if (!photo || photo.length === 0) {
      throw new Error('No se encontró foto en el mensaje.');
    }

    // Tomar la versión de mayor resolución (último elemento del array)
    const largestPhoto = photo[photo.length - 1];
    const mediaBuffer = await downloadTelegramFile(ctx, largestPhoto.file_id);

    // Convertir con sharp: 512×512, fit contain, fondo transparente, calidad 80
    const stickerBuffer = await sharp(mediaBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 80 })
      .toBuffer();

    // Enviar como sticker (InputFile desde buffer)
    await ctx.replyWithSticker(new InputFile(stickerBuffer, 'sticker.webp'));
    logger.info('[stickerHandler] Sticker estático enviado.');

  } catch (err) {
    logger.error('[stickerHandler] Error al crear sticker estático:', err);
    await ctx.reply(
      '❌ No pude convertir la imagen en sticker. Enviá una foto válida (JPEG o PNG).'
    ).catch(() => {});
  }
}

/**
 * Convierte un documento de imagen (PNG, WEBP, etc.) enviado como archivo en sticker estático.
 * Útil cuando el usuario envía la imagen como documento en lugar de foto comprimida.
 * @param {import('grammy').Context} ctx - Contexto de grammy.
 * @returns {Promise<void>}
 */
export async function handleDocumentSticker(ctx) {
  try {
    logger.info('[stickerHandler] Convirtiendo documento/imagen a sticker estático...');

    const document = ctx.message?.document;
    if (!document) {
      throw new Error('No se encontró documento en el mensaje.');
    }

    // Verificar que sea una imagen
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (document.mime_type && !validMimes.includes(document.mime_type)) {
      await ctx.reply(
        '❌ Solo proceso imágenes (JPEG, PNG, WEBP, GIF) como stickers. ' +
        'Para videos, enviame el enlace directamente.'
      );
      return;
    }

    const mediaBuffer = await downloadTelegramFile(ctx, document.file_id);

    const stickerBuffer = await sharp(mediaBuffer)
      .resize(512, 512, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 80 })
      .toBuffer();

    await ctx.replyWithSticker(new InputFile(stickerBuffer, 'sticker.webp'));
    logger.info('[stickerHandler] Sticker estático desde documento enviado.');

  } catch (err) {
    logger.error('[stickerHandler] Error al crear sticker desde documento:', err);
    await ctx.reply(
      '❌ No pude convertir el archivo en sticker. Asegurate de enviar una imagen válida.'
    ).catch(() => {});
  }
}

/**
 * Convierte un sticker animado recibido en Telegram en un sticker WebM animado.
 * Los stickers animados de TikTok llegan como .tgs (lottie) o .webm; se convierten a .webm VP9.
 * @param {import('grammy').Context} ctx - Contexto de grammy.
 * @returns {Promise<void>}
 */
export async function handleAnimatedSticker(ctx) {
  const timestamp = Date.now();
  const inputPath = path.join(config.tempDir, `sticker_in_${timestamp}`);
  const outputPath = path.join(config.tempDir, `sticker_out_${timestamp}.webm`);

  try {
    logger.info('[stickerHandler] Convirtiendo sticker animado...');

    const sticker = ctx.message?.sticker;
    if (!sticker) {
      throw new Error('No se encontró sticker en el mensaje.');
    }

    const mediaBuffer = await downloadTelegramFile(ctx, sticker.file_id);

    // Determinar extensión según el tipo de sticker
    // is_animated = true → .tgs (lottie); is_video = true → .webm
    let actualInputPath = inputPath;
    if (sticker.is_video) {
      actualInputPath = `${inputPath}.webm`;
    } else if (sticker.is_animated) {
      // .tgs es gzip de lottie JSON — ffmpeg puede procesarlo como input con libwebp
      actualInputPath = `${inputPath}.tgs`;
    } else {
      actualInputPath = `${inputPath}.webp`;
    }

    await writeFile(actualInputPath, mediaBuffer);
    await convertToAnimatedStickerWebm(actualInputPath, outputPath);

    const stickerBuffer = await readFile(outputPath);
    await ctx.replyWithSticker(new InputFile(stickerBuffer, 'sticker.webm'));
    logger.info('[stickerHandler] Sticker animado enviado.');

  } catch (err) {
    logger.error('[stickerHandler] Error al crear sticker animado:', err);
    await ctx.reply(
      '❌ No pude convertir el sticker animado. ' +
      'Los stickers .tgs (lottie) pueden no ser compatibles. Probá con un sticker de video (.webm).'
    ).catch(() => {});
  } finally {
    // Limpiar archivos temporales siempre
    const inputFiles = [
      `${inputPath}.webm`,
      `${inputPath}.tgs`,
      `${inputPath}.webp`,
      inputPath,
    ];
    for (const f of inputFiles) {
      unlink(f).catch(() => {});
    }
    unlink(outputPath).catch(() => {});
  }
}
