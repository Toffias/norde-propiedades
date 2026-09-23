import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { routes } from '../../lib/seo/routes';

export function SiteFooter() {
  const { address, email, telephone } = BUSINESS;

  return (
    <footer className="bg-muted/40 mt-24 border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div className="space-y-2">
          <p className="font-semibold">{BUSINESS.name}</p>
          <p className="text-muted-foreground text-sm">{BUSINESS.description}</p>
        </div>
        <nav aria-label="Pie de página" className="text-sm">
          <p className="mb-2 font-medium">Sitio</p>
          <ul className="text-muted-foreground space-y-1">
            <li>
              <Link href={routes.home()} className="hover:text-foreground">
                Inicio
              </Link>
            </li>
            <li>
              <Link href={routes.blog()} className="hover:text-foreground">
                Blog
              </Link>
            </li>
          </ul>
        </nav>
        {(email ?? telephone ?? address) && (
          <address className="text-muted-foreground space-y-1 text-sm not-italic">
            <p className="text-foreground mb-2 font-medium">Contacto</p>
            {address && (
              <p>
                {[address.streetAddress, address.addressLocality, address.addressRegion]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            {telephone && (
              <p>
                <a href={`tel:${telephone}`} className="hover:text-foreground">
                  {telephone}
                </a>
              </p>
            )}
            {email && (
              <p>
                <a href={`mailto:${email}`} className="hover:text-foreground">
                  {email}
                </a>
              </p>
            )}
          </address>
        )}
      </div>
      <div className="text-muted-foreground border-t py-4 text-center text-xs">
        © {new Date().getFullYear()} {BUSINESS.legalName}
      </div>
    </footer>
  );
}
