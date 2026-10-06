import type { MetadataRoute } from 'next';

import { absoluteUrl, routes } from './routes';

export interface SitemapSource {
  readonly posts: readonly { readonly slug: string; readonly updatedAt: string }[];
  /** Solo categorías con posts publicados (sin páginas vacías). */
  readonly categories: readonly { readonly slug: string; readonly updatedAt: string }[];
  /** Slugs de las propiedades publicadas. */
  readonly properties: readonly string[];
}

const latest = (dates: readonly string[]): string | undefined =>
  dates.length > 0 ? [...dates].sort().at(-1) : undefined;

/** Entradas del sitemap: páginas fijas, propiedades publicadas, blog, categorías y posts. */
export function buildSitemap(siteUrl: string, source: SitemapSource): MetadataRoute.Sitemap {
  const lastPost = latest(source.posts.map((p) => p.updatedAt));
  const withDate = (lastModified: string | undefined) => (lastModified ? { lastModified } : {});

  return [
    { url: absoluteUrl(siteUrl, routes.home()), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl(siteUrl, routes.properties()), changeFrequency: 'daily', priority: 0.9 },
    ...source.properties.map((slug) => ({
      url: absoluteUrl(siteUrl, routes.property(slug)),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    {
      url: absoluteUrl(siteUrl, routes.blog()),
      ...withDate(lastPost),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...source.categories.map((category) => ({
      url: absoluteUrl(siteUrl, routes.category(category.slug)),
      ...withDate(category.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...source.posts.map((post) => ({
      url: absoluteUrl(siteUrl, routes.post(post.slug)),
      lastModified: post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
