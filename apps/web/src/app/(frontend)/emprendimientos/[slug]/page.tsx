import type { Metadata } from 'next';

import {
  DevelopmentPage,
  developmentMetadata,
} from '../../../../components/developments/development-page';

// ISR on-demand (ADR 0011): cada ficha se genera en su primera visita (el build corre sin base) y
// queda cacheada hasta que apps/gestion avisa que el emprendimiento o una unidad cambió (ADR 0023).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Props = PageProps<'/emprendimientos/[slug]'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return developmentMetadata(decodeURIComponent((await params).slug), 1);
}

export default async function DevelopmentDetailPage({ params }: Props) {
  return <DevelopmentPage slug={decodeURIComponent((await params).slug)} page={1} />;
}
