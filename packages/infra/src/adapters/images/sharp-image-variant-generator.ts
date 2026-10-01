import type {
  ImageVariantGenerator,
  ImageVariants,
  InvalidPropertyImageError,
  MediaRotation,
} from '@norde/core/properties';
import { err, ok, type Result } from '@norde/core/shared';
import sharp from 'sharp';

/** Ancho de la miniatura (galería, tarjetas) y de la versión web (sitio, portales, PDF). */
const THUMBNAIL_WIDTH = 400;
const WEB_WIDTH = 1600;

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Variantes de una foto con sharp: endereza según el EXIF, aplica la rotación elegida en la ficha y
 * achica sin agrandar. Devuelve JPEG nuevos; la original no se toca.
 */
export class SharpImageVariantGenerator implements ImageVariantGenerator {
  async generate(input: {
    readonly original: Uint8Array;
    readonly rotation: MediaRotation;
  }): Promise<Result<ImageVariants, InvalidPropertyImageError>> {
    let upright: { data: Buffer; width: number; height: number };
    try {
      // `rotate()` sin argumentos endereza según el EXIF; después va la rotación de la ficha.
      const oriented = await sharp(toBuffer(input.original)).rotate().toBuffer();
      const { data, info } = await sharp(oriented)
        .rotate(input.rotation)
        .toBuffer({ resolveWithObject: true });
      upright = { data, width: info.width, height: info.height };
    } catch {
      // sharp lanza ante bytes que no son una imagen soportada: es un dato inválido, no un fallo.
      return err({ type: 'InvalidImage' });
    }

    const variant = (width: number) =>
      sharp(upright.data)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    const [thumbnail, web] = await Promise.all([variant(THUMBNAIL_WIDTH), variant(WEB_WIDTH)]);
    return ok({
      thumbnail: new Uint8Array(thumbnail),
      web: new Uint8Array(web),
      width: upright.width,
      height: upright.height,
    });
  }
}
