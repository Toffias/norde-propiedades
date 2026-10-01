import type { Metadata } from 'next';

import { DashboardDemo } from '../../_components/dashboard-demo';

export const metadata: Metadata = { title: 'Tablero' };

export default function DashboardPatternPage() {
  return <DashboardDemo />;
}
