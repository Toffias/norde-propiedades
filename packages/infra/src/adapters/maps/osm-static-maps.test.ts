import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../shared/logger';

import { OsmStaticMaps } from './osm-static-maps';

const PALERMO = { latitude: -34.5871, longitude: -58.4299 };

async function tilePng(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width: 256, height: 256, channels: 3, background: '#e8e4dc' } })
      .png()
      .toBuffer(),
  );
}

function setup(status = 200) {
  const urls: string[] = [];
  const agents: (string | null)[] = [];
  const warnings: string[] = [];
  const logger: InfraLogger = {
    info: () => undefined,
    warn: (_details, message) => warnings.push(message),
    error: () => undefined,
  };
  const fakeFetch: typeof fetch = async (input, init) => {
    urls.push(input instanceof Request ? input.url : input.toString());
    agents.push(new Headers(init?.headers).get('User-Agent'));
    return new Response(status === 200 ? await tilePng() : null, { status });
  };
  const maps = new OsmStaticMaps({
    userAgent: 'NordePropiedades/1.0 (test)',
    logger,
    tileUrl: 'https://tiles.example/{z}/{x}/{y}.png',
    fetch: fakeFetch,
  });
  return { maps, urls, agents, warnings };
}

describe('OsmStaticMaps', () => {
  it('stitches the tiles around the point into a 2:1 image, identifying the app', async () => {
    const { maps, urls, agents } = setup();
    const bytes = await maps.render(PALERMO);

    expect(bytes).toBeDefined();
    const meta = await sharp(Buffer.from(bytes ?? new Uint8Array())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1024, 512]);
    // 1024 × 512 a zoom 16 son entre 4 y 5 teselas de ancho y entre 2 y 3 de alto.
    expect(urls.length).toBeGreaterThanOrEqual(8);
    expect(urls.length).toBeLessThanOrEqual(15);
    expect(urls.every((url) => url.startsWith('https://tiles.example/16/'))).toBe(true);
    expect(new Set(agents)).toEqual(new Set(['NordePropiedades/1.0 (test)']));
  });

  it('keeps the tiles in memory for the next map of the same area', async () => {
    const { maps, urls } = setup();
    await maps.render(PALERMO);
    const first = urls.length;
    await maps.render(PALERMO);
    expect(urls).toHaveLength(first);
  });

  it('returns nothing when the tile server fails, so the PDF uses a photo instead', async () => {
    const { maps, warnings } = setup(503);
    expect(await maps.render(PALERMO)).toBeUndefined();
    expect(warnings[0]).toBe('Map tile request failed');
  });
});
