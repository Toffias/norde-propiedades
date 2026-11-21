import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { socialProfiles } from '../../lib/business/social-profiles';
import { listingHref, parseListingFilters } from '../../lib/properties/listing-filters';
import { routes } from '../../lib/seo/routes';
import { CompanyLogo } from '../brand/company-logo';
import { LeaveReviewLink } from '../brand/leave-review-link';
import { SocialIcon } from '../brand/social-icon';
import { PropertyMap } from '../properties/property-map';

const PROPERTY_LINKS = [
  { label: 'Propiedades en venta', href: listingHref(parseListingFilters({ operacion: 'venta' })) },
  {
    label: 'Propiedades en alquiler',
    href: listingHref(parseListingFilters({ operacion: 'alquiler' })),
  },
  { label: 'Todas las propiedades', href: routes.properties() },
] as const;

const SITE_LINKS = [
  { label: 'Emprendimientos', href: routes.developments() },
  { label: 'Tasaciones', href: routes.appraisals() },
  { label: 'Blog', href: routes.blog() },
  { label: 'Nosotros y contacto', href: routes.contact() },
] as const;

const LINK = 'hover:text-foreground transition-colors';
const ICON_LINK =
  'text-muted-foreground hover:text-foreground hover:bg-accent flex size-9 items-center justify-center rounded-full border transition-colors';

export function SiteFooter() {
  const { address, email, telephone, geo } = BUSINESS;
  const socials = socialProfiles(BUSINESS.sameAs);
  const addressLine = address
    ? [address.streetAddress, address.addressLocality, address.addressRegion]
        .filter(Boolean)
        .join(', ')
    : null;

  return (
    <footer className="mt-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-10 border-t py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4 lg:col-span-2">
            <CompanyLogo placement="footer" fallbackClassName="text-xl" />
            <p className="text-muted-foreground max-w-sm text-sm">{BUSINESS.description}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-1">
              {socials.length > 0 && (
                <ul className="flex items-center gap-2">
                  {socials.map((social) => (
                    <li key={social.url}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${BUSINESS.name} en ${social.label}`}
                        className={ICON_LINK}
                      >
                        <SocialIcon network={social.network} className="size-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <LeaveReviewLink className={`text-muted-foreground text-sm ${LINK}`} />
            </div>
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
              {SITE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {(email ?? telephone ?? address) && (
            <address className="text-muted-foreground space-y-2 text-sm not-italic">
              <p className="text-foreground mb-3 font-bold">Contacto</p>
              {addressLine && <p>{addressLine}</p>}
              {telephone && (
                <p>
                  <a href={`tel:${telephone}`} className={LINK}>
                    {BUSINESS.telephoneLabel ?? telephone}
                  </a>
                </p>
              )}
              {email && (
                <p>
                  <a href={`mailto:${email}`} className={`${LINK} wrap-anywhere`}>
                    {email}
                  </a>
                </p>
              )}
              {geo && (
                <PropertyMap
                  latitude={geo.latitude}
                  longitude={geo.longitude}
                  exact
                  label={`Ubicación de la oficina${addressLine ? `: ${addressLine}` : ''}`}
                  className="mt-4 h-36 max-w-xs rounded-xl"
                />
              )}
            </address>
          )}
        </div>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t py-5 text-center text-xs">
        <span>
          © {new Date().getFullYear()} {BUSINESS.legalName}
        </span>
        <Link href={routes.privacy()} className={LINK}>
          Política de privacidad
        </Link>
      </div>
    </footer>
  );
}
