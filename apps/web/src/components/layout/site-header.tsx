import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { Menu } from 'lucide-react';
import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { listingHref, parseListingFilters } from '../../lib/properties/listing-filters';
import { routes } from '../../lib/seo/routes';
import { whatsappHref } from '../../lib/whatsapp';
import { NordeLogo } from '../brand/norde-logo';

const NAV = [
  { label: 'Comprar', href: listingHref(parseListingFilters({ operacion: 'venta' })) },
  { label: 'Alquilar', href: listingHref(parseListingFilters({ operacion: 'alquiler' })) },
  { label: 'Todas las propiedades', href: routes.properties() },
  { label: 'Blog', href: routes.blog() },
] as const;

const LINK = 'text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 transition-colors';

export function SiteHeader() {
  const whatsapp = whatsappHref('Hola, quiero hacer una consulta.');

  return (
    <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-(--z-sticky) border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:h-20 sm:px-6">
        <Link
          href={routes.home()}
          aria-label={`${BUSINESS.name}, ir al inicio`}
          className="text-lg sm:text-xl"
        >
          <NordeLogo />
        </Link>

        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm font-medium">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-whatsapp bg-whatsapp/10 hover:bg-whatsapp/15 hidden items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors sm:inline-flex"
            >
              <WhatsAppIcon className="size-4" />
              WhatsApp
            </a>
          )}
          {/* Menú mobile sin JavaScript: `<details>` se abre y se cierra solo. */}
          <details className="group relative md:hidden">
            <summary
              aria-label="Abrir el menú"
              className="hover:bg-accent flex size-10 cursor-pointer list-none items-center justify-center rounded-xl [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </summary>
            <nav
              aria-label="Principal (mobile)"
              className="bg-popover absolute top-12 right-0 z-(--z-dropdown) w-64 rounded-2xl border p-2 shadow-lg"
            >
              <ul className="flex flex-col text-sm font-medium">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={`${LINK} block`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
