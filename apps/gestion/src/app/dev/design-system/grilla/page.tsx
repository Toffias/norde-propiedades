import type { Metadata } from 'next';

import { PropertiesGridDemo } from '../../_components/properties-grid-demo';

export const metadata: Metadata = { title: 'Grilla' };

export default function GridPatternPage() {
  return <PropertiesGridDemo />;
}
