import type { MetadataRoute } from 'next';

import { listCategories, listPublishedPosts, listPublishedPostSlugs } from '../../lib/blog/queries';
import { buildSitemap } from '../../lib/seo/sitemap';
import { getSiteUrl } from '../../lib/site-url';

// Por request (el build corre sin base); los datos salen del caché del blog.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, categories] = await Promise.all([listPublishedPostSlugs(), listCategories()]);
  const withPosts = await Promise.all(
    categories.map(async (category) =>
      (await listPublishedPosts(1, category.id)).totalPosts > 0 ? [category] : [],
    ),
  );

  return buildSitemap(getSiteUrl(), { posts, categories: withPosts.flat() });
}
