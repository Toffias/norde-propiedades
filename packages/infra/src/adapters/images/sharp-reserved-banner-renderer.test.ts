import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { SharpReservedBannerRenderer } from './sharp-reserved-banner-renderer';

async function solid(width: number, height: number, color: string, format: 'jpeg' | 'png') {
  const image = sharp({ create: { width, height, channels: 4, background: color } });
  return new Uint8Array(await (format === 'jpeg' ? image.jpeg() : image.png()).toBuffer());
}

async function pixel(bytes: Uint8Array, left: number, top: number) {
  const { data } = await sharp(bytes)
    .extract({ left, top, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return [...data.subarray(0, 3)];
}

function isRed([r = 0, g = 0, b = 0]: number[]) {
  return r > 180 && g < 120 && b < 120;
}

describe('SharpReservedBannerRenderer', () => {
  it('puts the uploaded banner where the domain places it and returns a JPEG', async () => {
    const photo = await solid(1000, 1000, '#ffffff', 'jpeg');
    const banner = await solid(600, 100, '#ff0000', 'png');

    const result = unwrap(await new SharpReservedBannerRenderer().render({ photo, banner }));

    expect(await sharp(result).metadata()).toMatchObject({
      format: 'jpeg',
      width: 1000,
      height: 1000,
    });
    // Placement: { left: 0, top: 200, width: 600, height: 100 }.
    expect(isRed(await pixel(result, 10, 250))).toBe(true);
    expect(isRed(await pixel(result, 590, 250))).toBe(true);
    expect(isRed(await pixel(result, 10, 150))).toBe(false);
    expect(isRed(await pixel(result, 700, 250))).toBe(false);
  });

  it('uses the default red "RESERVADO" strip without a banner', async () => {
    const photo = await solid(1600, 1200, '#ffffff', 'jpeg');

    const result = unwrap(
      await new SharpReservedBannerRenderer().render({ photo, banner: undefined }),
    );

    // Placement of the 1200 × 200 default: { left: 0, top: 240, width: 1040, height: 173 }.
    expect(isRed(await pixel(result, 5, 245))).toBe(true);
    expect(isRed(await pixel(result, 5, 200))).toBe(false);
  });

  it('rejects bytes that are not an image', async () => {
    const result = await new SharpReservedBannerRenderer().render({
      photo: new Uint8Array([1, 2, 3]),
      banner: undefined,
    });
    expect(unwrapErr(result)).toEqual({ type: 'InvalidImage' });
  });
});
