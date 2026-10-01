import type { ImageWatermarker, InvalidImageError, Watermark } from '@norde/core/settings';
import { err, ok, type Result } from '@norde/core/shared';
import sharp, { type OutputInfo } from 'sharp';

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Marca de agua con sharp: escala el logo y lo ubica según `Watermark.placement` (la regla vive en
 * el dominio), le aplica la opacidad y devuelve un JPEG nuevo. El original no se toca.
 */
export class SharpImageWatermarker implements ImageWatermarker {
  async apply(input: {
    readonly photo: Uint8Array;
    readonly logo: Uint8Array;
    readonly watermark: Watermark;
  }): Promise<Result<Uint8Array, InvalidImageError>> {
    let photo: { data: Buffer; info: OutputInfo };
    let logoSize: { width: number; height: number };
    try {
      // `rotate()` sin argumentos endereza según el EXIF: la marca va donde se ve la foto.
      photo = await sharp(toBuffer(input.photo)).rotate().toBuffer({ resolveWithObject: true });
      const metadata = await sharp(toBuffer(input.logo)).metadata();
      logoSize = { width: metadata.width, height: metadata.height };
    } catch {
      // sharp lanza ante bytes que no son una imagen soportada: es un dato inválido, no un fallo.
      return err({ type: 'InvalidImage' });
    }

    const placement = input.watermark.placement(
      { width: photo.info.width, height: photo.info.height },
      logoSize,
    );
    const alpha = Math.round((255 * input.watermark.opacity) / 100);
    const logo = await sharp(toBuffer(input.logo))
      .resize(placement.width, placement.height)
      .ensureAlpha()
      // Multiplica el canal alfa del logo por la opacidad configurada.
      .composite([
        {
          input: Buffer.from([255, 255, 255, alpha]),
          raw: { width: 1, height: 1, channels: 4 },
          tile: true,
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();

    const result = await sharp(photo.data)
      .composite([{ input: logo, left: placement.left, top: placement.top }])
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return ok(new Uint8Array(result));
  }
}
