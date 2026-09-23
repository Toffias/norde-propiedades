import { describe, expect, it } from 'vitest';

import { buildSitemap } from './sitemap';

const SITE = 'https://norde.com.ar';

describe('buildSitemap', () => {
  it('lists the home, the blog, the categories and the posts with absolute URLs', () => {
    const sitemap = buildSitemap(SITE, {
      posts: [
        { slug: 'aumento-ipc', updatedAt: '2026-09-10T00:00:00.000Z' },
        { slug: 'vivir-en-palermo', updatedAt: '2026-09-20T00:00:00.000Z' },
      ],
      categories: [{ slug: 'alquilar', updatedAt: '2026-09-01T00:00:00.000Z' }],
    });

    expect(sitemap.map((e) => e.url)).toEqual([
      'https://norde.com.ar/',
      'https://norde.com.ar/blog',
      'https://norde.com.ar/blog/categoria/alquilar',
      'https://norde.com.ar/blog/aumento-ipc',
      'https://norde.com.ar/blog/vivir-en-palermo',
    ]);
  });

  it('dates the blog with its latest post', () => {
    const sitemap = buildSitemap(SITE, {
      posts: [
        { slug: 'a', updatedAt: '2026-09-10T00:00:00.000Z' },
        { slug: 'b', updatedAt: '2026-09-20T00:00:00.000Z' },
      ],
      categories: [],
    });
    expect(sitemap[1]?.lastModified).toBe('2026-09-20T00:00:00.000Z');
  });

  it('works without posts', () => {
    const sitemap = buildSitemap(SITE, { posts: [], categories: [] });
    expect(sitemap).toHaveLength(2);
    expect(sitemap[1]).not.toHaveProperty('lastModified');
  });
});
