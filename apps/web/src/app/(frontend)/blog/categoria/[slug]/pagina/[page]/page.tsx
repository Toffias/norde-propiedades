import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CategoryPage, categoryMetadata } from '../../../../../../../components/blog/category-page';
import { parsePageParam } from '../../../../../../../lib/pagination';

// ISR on-demand (ver /blog/pagina/[page]).
export function generateStaticParams(): { slug: string; page: string }[] {
  return [];
}

type Props = PageProps<'/blog/categoria/[slug]/pagina/[page]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page } = await params;
  const pageNumber = parsePageParam(page);
  return pageNumber ? categoryMetadata(decodeURIComponent(slug), pageNumber) : {};
}

export default async function BlogCategoryPaginatedPage({ params }: Props) {
  const { slug, page } = await params;
  const pageNumber = parsePageParam(page);
  if (!pageNumber) notFound();
  return <CategoryPage slug={decodeURIComponent(slug)} page={pageNumber} />;
}
