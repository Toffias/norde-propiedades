import { ThemeSwitcher } from '@norde/ui/components/theme-switcher';
import { WhatsAppIcon } from '@norde/ui/components/whatsapp-icon';
import { Menu } from 'lucide-react';
import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { SITE_NAV } from '../../lib/layout/site-nav';
import { routes } from '../../lib/seo/routes';
import { whatsappHref } from '../../lib/whatsapp';
import { NordeLogo } from '../brand/norde-logo';
import { HeaderShell } from './header-shell';

const LINK = 'text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 transition-colors';
/** Sobre la foto del hero (header transparente de la home). */
const ON_PHOTO =
  'group-data-[overlay=true]/header:text-white/90 group-data-[overlay=true]/header:hover:text-white';

export function SiteHeader() {
  const whatsapp = whatsappHref('Hola, quiero hacer una consulta.');

  return (
    <HeaderShell>
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
            {SITE_NAV.map((entry) => (
              <li key={entry.href}>
                <Link href={entry.href} className={`${LINK} ${ON_PHOTO}`}>
                  {entry.label}
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
              className="text-whatsapp bg-whatsapp/10 hover:bg-whatsapp/15 group-data-[overlay=true]/header:bg-whatsapp hidden items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors group-data-[overlay=true]/header:text-white sm:inline-flex"
            >
              <WhatsAppIcon className="size-4" />
              WhatsApp
            </a>
          )}
          <ThemeSwitcher
            className={`text-muted-foreground hover:text-foreground size-10 rounded-xl has-[>svg]:px-0 ${ON_PHOTO}`}
          />
          {/* Menú mobile sin JavaScript: `<details>` se abre y se cierra solo. */}
          <details className="group relative md:hidden">
            <summary
              aria-label="Abrir el menú"
              className="hover:bg-accent flex size-10 cursor-pointer list-none items-center justify-center rounded-xl group-data-[overlay=true]/header:text-white group-data-[overlay=true]/header:hover:bg-white/15 [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </summary>
            <nav
              aria-label="Principal (mobile)"
              className="bg-popover absolute top-12 right-0 z-(--z-dropdown) max-h-[calc(100dvh-5rem)] w-64 overflow-y-auto rounded-2xl border p-2 shadow-lg"
            >
              <ul className="flex flex-col text-sm font-medium">
                {SITE_NAV.map((entry) => (
                  <li key={entry.href}>
                    <Link href={entry.href} className={`${LINK} block`}>
                      {entry.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </HeaderShell>
  );
}
