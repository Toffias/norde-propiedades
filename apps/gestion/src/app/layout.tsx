import './globals.css';

import { ThemeProvider } from '@norde/ui/components/theme-provider';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Norde · Gestión', template: '%s · Norde Gestión' },
  // Panel interno: nunca indexar.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
