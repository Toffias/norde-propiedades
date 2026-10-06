import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { listingHref, parseListingFilters } from '../../lib/properties/listing-filters';
import { routes } from '../../lib/seo/routes';
import { NordeLogo } from '../brand/norde-logo';

const PROPERTY_LINKS = [
  { label: 'Propiedades en venta', href: listingHref(parseListingFilters({ operacion: 'venta' })) },
  {
    label: 'Propiedades en alquiler',
    href: listingHref(parseListingFilters({ operacion: 'alquiler' })),
  },
  { label: 'Todas las propiedades', href: routes.properties() },
] as const;

const LINK = 'hover:text-foreground transition-colors';

export function SiteFooter() {
  const { address, email, telephone } = BUSINESS;

  return (
    <footer className="mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div aria-hidden className="deco-steps" />
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-2">
            <NordeLogo className="text-xl" />
            <p className="text-muted-foreground max-w-sm text-sm">{BUSINESS.description}</p>
          </div>
          <nav aria-label="Pie de página" className="text-sm">
            <p className="mb-3 font-bold">Propiedades</p>
            <ul className="text-muted-foreground space-y-2">
              {PROPERTY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={routes.blog()} className={LINK}>
                  Blog
                </Link>
              </li>
            </ul>
          </nav>
          {(email ?? telephone ?? address) && (
            <address className="text-muted-foreground space-y-2 text-sm not-italic">
              <p className="text-foreground mb-3 font-bold">Contacto</p>
              {address && (
                <p>
                  {[address.streetAddress, address.addressLocality, address.addressRegion]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {telephone && (
                <p>
                  <a href={`tel:${telephone}`} className={LINK}>
                    {telephone}
                  </a>
                </p>
              )}
              {email && (
                <p>
                  <a href={`mailto:${email}`} className={LINK}>
                    {email}
                  </a>
                </p>
              )}
            </address>
          )}
        </div>
      </div>
      <div className="text-muted-foreground border-t py-5 text-center text-xs">
        © {new Date().getFullYear()} {BUSINESS.legalName}
      </div>
    </footer>
  );
}
