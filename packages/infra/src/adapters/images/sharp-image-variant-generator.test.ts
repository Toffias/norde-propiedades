import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { SharpImageVariantGenerator } from './sharp-image-variant-generator';

async function photo(width: number, height: number) {
  const image = sharp({ create: { width, height, channels: 3, background: '#3366cc' } });
  return new Uint8Array(await image.jpeg().toBuffer());
}

// Procesar una foto de 4000 × 3000 (y cargar sharp la primera vez) lleva varios segundos en el CI.
describe('SharpImageVariantGenerator', { timeout: 20_000 }, () => {
  const generator = new SharpImageVariantGenerator();

  it('shrinks to a thumbnail and a web version, both JPEG', async () => {
    const result = unwrap(
      await generator.generate({ original: await photo(4000, 3000), rotation: 0 }),
    );
    expect(result).toMatchObject({ width: 4000, height: 3000 });
    expect(await sharp(result.thumbnail).metadata()).toMatchObject({ format: 'jpeg', width: 400 });
    expect(await sharp(result.web).metadata()).toMatchObject({ format: 'jpeg', width: 1600 });
  });

  it('applies the rotation chosen in the detail page', async () => {
    const result = unwrap(
      await generator.generate({ original: await photo(800, 600), rotation: 90 }),
    );
    expect(result).toMatchObject({ width: 600, height: 800 });
    expect(await sharp(result.web).metadata()).toMatchObject({ width: 600, height: 800 });
  });

  it('does not enlarge a small photo', async () => {
    const result = unwrap(
      await generator.generate({ original: await photo(300, 200), rotation: 0 }),
    );
    expect(await sharp(result.web).metadata()).toMatchObject({ width: 300 });
  });

  it('reports bytes that are not an image', async () => {
    expect(
      unwrapErr(await generator.generate({ original: new Uint8Array([1, 2, 3]), rotation: 0 })),
    ).toEqual({ type: 'InvalidImage' });
  });
});
