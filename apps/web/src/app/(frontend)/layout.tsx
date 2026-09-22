import './globals.css';

import { ThemeProvider } from '@norde/ui/components/theme-provider';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { getEnv } from '../../config/env';

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getEnv().NEXT_PUBLIC_SERVER_URL),
    title: { default: 'Norde Propiedades', template: '%s | Norde Propiedades' },
    description: 'Compra, venta y alquiler de propiedades.',
  };
}

export default function FrontendLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
