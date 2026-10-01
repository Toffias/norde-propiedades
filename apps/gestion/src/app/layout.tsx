import './globals.css';

import { cn } from '@norde/ui/lib/utils';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

import { Providers } from '../components/providers';
import { configureZodMessages } from '../lib/zod-messages';

// Mensajes de validación también del lado del servidor (Server Actions).
configureZodMessages();

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

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
    <html
      lang="es-AR"
      suppressHydrationWarning
      className={cn(plexSans.variable, spaceGrotesk.variable)}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
