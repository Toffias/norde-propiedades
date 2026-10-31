import './globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { Providers } from '../components/providers';
import { configureZodMessages } from '../lib/zod-messages';

// Mensajes de validación también del lado del servidor (Server Actions).
configureZodMessages();

export const metadata: Metadata = {
  title: { default: 'Norde · Gestión', template: '%s · Norde Gestión' },
  // Panel interno: nunca indexar.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Color de la barra del navegador en mobile: los tokens `--background` de themes/gestion.css.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#161612' },
  ],
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
