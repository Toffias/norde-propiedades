import './globals.css';

import { ThemeProvider } from '@norde/ui/components/theme-provider';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { SiteFooter } from '../../components/layout/site-footer';
import { SiteHeader } from '../../components/layout/site-header';
import { WhatsAppFloat } from '../../components/layout/whatsapp-float';
import { JsonLdScript } from '../../components/seo/json-ld-script';
import { BUSINESS, SITE_TITLE } from '../../constants/business';
import { organizationSchema, websiteSchema } from '../../lib/seo/json-ld';
import { buildMetadata } from '../../lib/seo/metadata';
import { routes } from '../../lib/seo/routes';
import { getSiteUrl } from '../../lib/site-url';

export function generateMetadata(): Metadata {
  // Valores por defecto (OG, Twitter). El canonical lo define cada página: no se hereda.
  const { alternates: _canonical, ...defaults } = buildMetadata({
    title: SITE_TITLE,
    path: routes.home(),
  });
  return {
    ...defaults,
    metadataBase: new URL(getSiteUrl()),
    title: { default: SITE_TITLE, template: `%s | ${BUSINESS.name}` },
    applicationName: BUSINESS.name,
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    // Los `--background` de themes/web.css.
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#171412' },
  ],
};

export default function FrontendLayout({ children }: { readonly children: ReactNode }) {
  const siteUrl = getSiteUrl();

  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <JsonLdScript data={[organizationSchema(siteUrl), websiteSchema(siteUrl)]} />
        <ThemeProvider>
          <a
            href="#contenido"
            className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
          >
            Saltar al contenido
          </a>
          <SiteHeader />
          <main id="contenido" className="flex-1">
            {children}
          </main>
          <SiteFooter />
          <WhatsAppFloat />
        </ThemeProvider>
      </body>
    </html>
  );
}
