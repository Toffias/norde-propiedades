import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PostListView } from '../../../../../components/blog/post-list-view';
import { BLOG_COPY } from '../../../../../lib/blog/copy';
import { listCategories, listPublishedPosts } from '../../../../../lib/blog/queries';
import { parsePageParam } from '../../../../../lib/pagination';
import { buildMetadata, withBrand } from '../../../../../lib/seo/metadata';
import { routes } from '../../../../../lib/seo/routes';

// ISR on-demand: nada se pre-genera en el build (corre sin base); cada página se genera en
// la primera visita y queda cacheada hasta que se publica algo (tag del blog).
export function generateStaticParams(): { page: string }[] {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<'/blog/pagina/[page]'>): Promise<Metadata> {
  const page = parsePageParam((await params).page);
  if (!page) return {};
  return buildMetadata({
    title: withBrand(`${BLOG_COPY.title}, página ${page}`),
    description: BLOG_COPY.description,
    path: routes.blogPage(page),
  });
}

export default async function BlogPaginatedPage({ params }: PageProps<'/blog/pagina/[page]'>) {
  const page = parsePageParam((await params).page);
  if (!page) notFound();

  const [list, categories] = await Promise.all([listPublishedPosts(page), listCategories()]);
  if (page > list.totalPages) notFound();

  return (
    <PostListView
      title={BLOG_COPY.heading}
      intro={BLOG_COPY.intro}
      breadcrumbs={[
        { name: BLOG_COPY.home, path: routes.home() },
        { name: BLOG_COPY.title, path: routes.blog() },
        { name: `Página ${page}`, path: routes.blogPage(page) },
      ]}
      list={list}
      page={page}
      hrefForPage={routes.blogPage}
      categories={categories}
    />
  );
}
