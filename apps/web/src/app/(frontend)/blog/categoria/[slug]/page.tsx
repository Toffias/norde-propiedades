import type { Metadata } from 'next';

import { CategoryPage, categoryMetadata } from '../../../../../components/blog/category-page';

// ISR on-demand (ver /blog/pagina/[page]).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<'/blog/categoria/[slug]'>): Promise<Metadata> {
  return categoryMetadata(decodeURIComponent((await params).slug), 1);
}

export default async function BlogCategoryPage({ params }: PageProps<'/blog/categoria/[slug]'>) {
  return <CategoryPage slug={decodeURIComponent((await params).slug)} page={1} />;
}
