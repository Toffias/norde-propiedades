import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  DevelopmentPage,
  developmentMetadata,
} from '../../../../../../components/developments/development-page';
import { parsePageParam } from '../../../../../../lib/pagination';

// ISR on-demand (ver /emprendimientos/[slug]): las unidades de la página 2 en adelante.
export function generateStaticParams(): { slug: string; page: string }[] {
  return [];
}

type Props = PageProps<'/emprendimientos/[slug]/pagina/[page]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page } = await params;
  const pageNumber = parsePageParam(page);
  return pageNumber ? developmentMetadata(decodeURIComponent(slug), pageNumber) : {};
}

export default async function DevelopmentUnitsPage({ params }: Props) {
  const { slug, page } = await params;
  const pageNumber = parsePageParam(page);
  if (!pageNumber) notFound();
  return <DevelopmentPage slug={decodeURIComponent(slug)} page={pageNumber} />;
}
