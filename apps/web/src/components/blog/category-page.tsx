import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BLOG_COPY } from '../../lib/blog/copy';
import { findCategoryBySlug, listCategories, listPublishedPosts } from '../../lib/blog/queries';
import { buildMetadata, withBrand } from '../../lib/seo/metadata';
import { routes } from '../../lib/seo/routes';
import { nonEmpty } from '../../lib/strings';
import { PostListView } from './post-list-view';

const intro = (title: string, description: string | null | undefined) =>
  nonEmpty(description) ??
  `Artículos de ${BLOG_COPY.heading.toLowerCase()} sobre ${title.toLowerCase()}.`;

/** Metadata de `/blog/categoria/<slug>` y sus páginas siguientes. */
export async function categoryMetadata(slug: string, page: number): Promise<Metadata> {
  const category = await findCategoryBySlug(slug);
  if (!category) return {};
  const title = page > 1 ? `${category.title}, página ${page}` : category.title;
  return buildMetadata({
    title: withBrand(`${title} | ${BLOG_COPY.title}`),
    description: intro(category.title, category.description),
    path: routes.categoryPage(category.slug, page),
  });
}

/** Página de una categoría del blog (con su propia URL, metadata y lugar en el sitemap). */
export async function CategoryPage({
  slug,
  page,
}: {
  readonly slug: string;
  readonly page: number;
}) {
  const category = await findCategoryBySlug(slug);
  if (!category) notFound();

  const [list, categories] = await Promise.all([
    listPublishedPosts(page, category.id),
    listCategories(),
  ]);
  if (page > list.totalPages) notFound();

  const breadcrumbs = [
    { name: BLOG_COPY.home, path: routes.home() },
    { name: BLOG_COPY.title, path: routes.blog() },
    { name: category.title, path: routes.category(category.slug) },
    ...(page > 1
      ? [{ name: `Página ${page}`, path: routes.categoryPage(category.slug, page) }]
      : []),
  ];

  return (
    <PostListView
      title={category.title}
      intro={intro(category.title, category.description)}
      breadcrumbs={breadcrumbs}
      list={list}
      page={page}
      hrefForPage={(p) => routes.categoryPage(category.slug, p)}
      categories={categories}
      activeCategoryId={category.id}
    />
  );
}
