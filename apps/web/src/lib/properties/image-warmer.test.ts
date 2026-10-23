import { describe, expect, it } from 'vitest';

import { WARM_WIDTHS } from '../images/sizes';
import { ImageWarmer } from './image-warmer';

const ORIGIN = 'https://norde.test';

function setup(options: {
  readonly photos: Record<string, readonly string[]>;
  readonly respond?: (url: string) => Response | Promise<Response>;
}) {
  const requested: { url: string; accept: string | null }[] = [];
  const warnings: Record<string, unknown>[] = [];
  const listed: string[] = [];
  const warmer = new ImageWarmer({
    photosOf: (propertyId) => {
      listed.push(propertyId);
      const photos = options.photos[propertyId];
      return photos ? Promise.resolve(photos) : Promise.reject(new Error('database down'));
    },
    fetch: async (url, init) => {
      requested.push({ url, accept: new Headers(init.headers).get('accept') });
      return options.respond ? options.respond(url) : new Response('bytes');
    },
    origin: ORIGIN,
    logger: {
      warn: (details) => {
        warnings.push(details);
      },
    },
  });
  return { warmer, requested, warnings, listed };
}

const imageUrl = (src: string, width: number) =>
  `${ORIGIN}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;

describe('ImageWarmer', () => {
  it('requests every published photo as WebP in each width the site uses', async () => {
    const { warmer, requested } = setup({ photos: { p1: ['/fotos/m1/v1', '/fotos/m2/v1'] } });

    warmer.schedule('p1');
    await warmer.idle();

    expect(requested.map((r) => r.url)).toEqual([
      ...WARM_WIDTHS.map((width) => imageUrl('/fotos/m1/v1', width)),
      ...WARM_WIDTHS.map((width) => imageUrl('/fotos/m2/v1', width)),
    ]);
    expect(requested.every((r) => r.accept === 'image/webp')).toBe(true);
  });

  it('skips imported photos that live on another domain', async () => {
    const { warmer, requested } = setup({
      photos: { p1: ['https://static.tokkobroker.com/pictures/1.jpg'] },
    });

    warmer.schedule('p1');
    await warmer.idle();

    expect(requested).toEqual([]);
  });

  it('warms a property once when it is scheduled again while waiting in the queue', async () => {
    const { warmer, listed } = setup({ photos: { p1: ['/fotos/m1/v1'], p2: ['/fotos/m2/v1'] } });

    warmer.schedule('p1');
    warmer.schedule('p2');
    warmer.schedule('p2');
    await warmer.idle();

    expect(listed).toEqual(['p1', 'p2']);
  });

  it('logs a failed conversion and keeps warming the rest', async () => {
    const failing = imageUrl('/fotos/m1/v1', WARM_WIDTHS[0] ?? 0);
    const { warmer, requested, warnings } = setup({
      photos: { p1: ['/fotos/m1/v1'] },
      respond: (url) => {
        if (url === failing) return new Response('', { status: 500 });
        return new Response('bytes');
      },
    });

    warmer.schedule('p1');
    await warmer.idle();

    expect(requested).toHaveLength(WARM_WIDTHS.length);
    expect(warnings).toEqual([{ src: '/fotos/m1/v1', width: WARM_WIDTHS[0], status: 500 }]);
  });

  it('logs a property whose photos cannot be read and moves on to the next one', async () => {
    const { warmer, requested, warnings } = setup({ photos: { p2: ['/fotos/m2/v1'] } });

    warmer.schedule('p1');
    warmer.schedule('p2');
    await warmer.idle();

    expect(warnings).toMatchObject([{ propertyId: 'p1' }]);
    expect(requested).toHaveLength(WARM_WIDTHS.length);
  });
});
