import { Clock, Mail, Phone } from 'lucide-react';

import { BUSINESS } from '../../constants/business';
import { formatOpeningHours } from '../../lib/business/opening-hours';
import { socialProfiles } from '../../lib/business/social-profiles';
import { SocialIcon } from '../brand/social-icon';

const LINK = 'inline-flex items-center gap-2 underline-offset-4 hover:underline';

/**
 * Barra arriba del header con teléfono, email, horario y redes, todo desde `BUSINESS`. Muestra
 * solo lo que Norde confirmó; sin ningún dato, no aparece. En mobile quedan el teléfono y las redes.
 */
export function SiteTopBar() {
  const { email, telephone } = BUSINESS;
  const phoneLabel = BUSINESS.telephoneLabel ?? telephone;
  const hours = formatOpeningHours(BUSINESS.openingHours);
  const socials = socialProfiles(BUSINESS.sameAs);
  if (!telephone && !email && !hours && socials.length === 0) return null;

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
        {socials.length > 0 && (
          <ul aria-label="Redes sociales" className="flex shrink-0 items-center gap-1">
            {socials.map((social) => (
              <li key={social.url}>
                <a
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${BUSINESS.name} en ${social.label}`}
                  className="hover:bg-background/10 dark:hover:bg-accent flex size-8 items-center justify-center rounded-full transition-colors"
                >
                  <SocialIcon network={social.network} className="size-4" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
