import type { Metadata } from 'next';

import { PropertyDetailDemo } from '../../_components/property-detail-demo';

export const metadata: Metadata = { title: 'Ficha' };

export default function DetailPatternPage() {
  return <PropertyDetailDemo />;
}
