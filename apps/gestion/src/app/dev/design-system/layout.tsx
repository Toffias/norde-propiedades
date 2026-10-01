import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DesignSystemShell } from '../_components/design-system-shell';

export const metadata: Metadata = { title: 'Design system' };

export default function DesignSystemLayout({ children }: { readonly children: ReactNode }) {
  return <DesignSystemShell>{children}</DesignSystemShell>;
}
