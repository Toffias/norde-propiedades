import type { Metadata } from 'next';

import { PostListView } from '../../../components/blog/post-list-view';
import { BLOG_COPY } from '../../../lib/blog/copy';
import { listCategories, listPublishedPosts } from '../../../lib/blog/queries';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';

// Se renderiza por request (el build corre sin base de datos). Los datos salen del caché
// con el tag del blog, que los hooks de Payload invalidan al publicar.
export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: withBrand(BLOG_COPY.title),
    description: BLOG_COPY.description,
    path: routes.blog(),
  });
}

export default async function BlogPage() {
  const [list, categories] = await Promise.all([listPublishedPosts(1), listCategories()]);

  return (
    <PostListView
      title={BLOG_COPY.heading}
      intro={BLOG_COPY.intro}
      breadcrumbs={[
        { name: BLOG_COPY.home, path: routes.home() },
        { name: BLOG_COPY.title, path: routes.blog() },
      ]}
      list={list}
      page={1}
      hrefForPage={routes.blogPage}
      categories={categories}
    />
  );
}
