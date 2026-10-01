import type { Metadata } from 'next';

import { ComponentsDemo } from '../../_components/components-demo';

export const metadata: Metadata = { title: 'Componentes' };

export default function ComponentsPage() {
  return <ComponentsDemo />;
}
