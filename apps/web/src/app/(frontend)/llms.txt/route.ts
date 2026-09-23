import { latestPosts, listCategories } from '../../../lib/blog/queries';
import { buildLlmsTxt } from '../../../lib/seo/llms-txt';
import { getSiteUrl } from '../../../lib/site-url';

// Por request (el build corre sin base); los datos salen del caché del blog.
export const dynamic = 'force-dynamic';

const MAX_GUIDES = 50;

export async function GET(): Promise<Response> {
  const [categories, posts] = await Promise.all([listCategories(), latestPosts(MAX_GUIDES)]);

  const body = buildLlmsTxt(getSiteUrl(), {
    categories: categories.map(({ title, slug }) => ({ title, slug })),
    posts: posts.map(({ title, slug, description }) => ({ title, slug, description })),
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
