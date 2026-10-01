import { Watermark } from '@norde/core/settings';
import { unwrap } from '@norde/core/shared/testing';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { SharpImageWatermarker } from './sharp-image-watermarker';

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

const watermark = unwrap(
  Watermark.create({
    enabled: true,
    logoKey: 'settings/watermark/logo',
    sizePercent: 20,
    position: 'bottom-right',
    opacity: 100,
  }),
);

describe('SharpImageWatermarker', () => {
  it('composites the logo where the domain places it and returns a JPEG', async () => {
    const photo = await solid(1000, 500, '#ffffff', 'jpeg');
    const logo = await solid(400, 100, '#ff0000', 'png');

    const result = unwrap(await new SharpImageWatermarker().apply({ photo, logo, watermark }));

    const metadata = await sharp(result).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 1000, height: 500 });
    // Placement: { left: 785, top: 435, width: 200, height: 50 }.
    const [r, g, b] = await pixel(result, 880, 460);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(60);
    expect(b).toBeLessThan(60);
    expect(await pixel(result, 100, 100)).toEqual([255, 255, 255]);
  });

  it('applies the opacity', async () => {
    const photo = await solid(1000, 500, '#ffffff', 'jpeg');
    const logo = await solid(400, 100, '#000000', 'png');
    const half = unwrap(Watermark.create({ ...watermark.toProps(), opacity: 50 }));

    const result = unwrap(
      await new SharpImageWatermarker().apply({ photo, logo, watermark: half }),
    );

    const [r] = await pixel(result, 880, 460);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
  });

  it('reports bytes that are not an image', async () => {
    const logo = await solid(10, 10, '#000000', 'png');
    const result = await new SharpImageWatermarker().apply({
      photo: new Uint8Array([1, 2, 3]),
      logo,
      watermark,
    });
    expect(result.isErr() && result.error).toEqual({ type: 'InvalidImage' });
  });
});
