import { Clock, Mail, Newspaper, Phone } from 'lucide-react';
import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { formatOpeningHours } from '../../lib/business/opening-hours';
import { socialProfiles } from '../../lib/business/social-profiles';
import { routes } from '../../lib/seo/routes';
import { SocialIcon } from '../brand/social-icon';

const LINK = 'inline-flex items-center gap-2 underline-offset-4 hover:underline';
const ICON_LINK =
  'hover:bg-background/10 dark:hover:bg-accent flex size-8 items-center justify-center rounded-full transition-colors';

/**
 * Barra arriba del header con teléfono, email, horario y redes, todo desde `BUSINESS`, y el ícono
 * del blog antes de las redes. Muestra solo los datos que Norde confirmó. En mobile quedan el
 * teléfono, el blog y las redes.
 */
export function SiteTopBar() {
  const { email, telephone } = BUSINESS;
  const phoneLabel = BUSINESS.telephoneLabel ?? telephone;
  const hours = formatOpeningHours(BUSINESS.openingHours);
  const socials = socialProfiles(BUSINESS.sameAs);

  return (
    <div className="bg-ink text-background dark:bg-card dark:text-foreground text-xs font-medium dark:border-b">
      <div className="mx-auto flex h-10 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <ul className="flex min-w-0 items-center gap-5">
          {telephone && (
            <li>
              <a href={`tel:${telephone}`} className={LINK}>
                <Phone aria-hidden className="size-3.5" />
                {phoneLabel}
              </a>
            </li>
          )}
          {email && (
            <li className="hidden md:block">
              <a href={`mailto:${email}`} className={LINK}>
                <Mail aria-hidden className="size-3.5" />
                {email}
              </a>
            </li>
          )}
          {hours && (
            <li className="hidden items-center gap-2 lg:inline-flex">
              <Clock aria-hidden className="size-3.5" />
              {hours}
            </li>
          )}
        </ul>
        <ul aria-label="Blog y redes sociales" className="flex shrink-0 items-center gap-1">
          <li>
            <Link href={routes.blog()} aria-label="Blog" title="Blog" className={ICON_LINK}>
              <Newspaper aria-hidden className="size-4" />
            </Link>
          </li>
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
      </div>
    </div>
  );
}
