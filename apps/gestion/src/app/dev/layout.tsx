import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getNodeEnv } from '../../config/env';

// Pantallas de referencia del design system: solo en desarrollo, nunca en producción.
export default function DevLayout({ children }: { readonly children: ReactNode }) {
  if (getNodeEnv() === 'production') notFound();
  return children;
}
