import { reservedBannerPlacement, type ReservedBannerRenderer } from '@norde/core/properties';
import { err, ok, type Result } from '@norde/core/shared';
import sharp, { type OutputInfo } from 'sharp';

import { DEFAULT_RESERVED_BANNER_PNG_BASE64 } from './default-reserved-banner';

const DEFAULT_BANNER = Buffer.from(DEFAULT_RESERVED_BANNER_PNG_BASE64, 'base64');

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Banner "Reservado" con sharp: lo escala y lo ubica según `reservedBannerPlacement` (la regla vive
 * en el dominio) y devuelve un JPEG nuevo. La portada no se toca.
 */
export class SharpReservedBannerRenderer implements ReservedBannerRenderer {
  async render(input: {
    readonly photo: Uint8Array;
    readonly banner: Uint8Array | undefined;
  }): Promise<Result<Uint8Array, { readonly type: 'InvalidImage' }>> {
    const bannerBytes = input.banner === undefined ? DEFAULT_BANNER : toBuffer(input.banner);
    let photo: { data: Buffer; info: OutputInfo };
    let bannerSize: { width: number; height: number };
    try {
      photo = await sharp(toBuffer(input.photo)).rotate().toBuffer({ resolveWithObject: true });
      const metadata = await sharp(bannerBytes).metadata();
      bannerSize = { width: metadata.width, height: metadata.height };
    } catch {
      // sharp lanza ante bytes que no son una imagen soportada: es un dato inválido, no un fallo.
      return err({ type: 'InvalidImage' });
    }

    const placement = reservedBannerPlacement(
      { width: photo.info.width, height: photo.info.height },
      bannerSize,
    );
    const banner = await sharp(bannerBytes)
      .resize(placement.width, placement.height)
      .ensureAlpha()
      .png()
      .toBuffer();
    const result = await sharp(photo.data)
      .composite([{ input: banner, left: placement.left, top: placement.top }])
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    return ok(new Uint8Array(result));
  }
}
