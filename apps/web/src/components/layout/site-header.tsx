import Link from 'next/link';

import { BUSINESS } from '../../constants/business';
import { routes } from '../../lib/seo/routes';

const NAV = [
  { label: 'Inicio', href: routes.home() },
  { label: 'Blog', href: routes.blog() },
] as const;

export function SiteHeader() {
  return (
    <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href={routes.home()}
          className="text-lg font-semibold tracking-tight"
          aria-label={`${BUSINESS.name}, ir al inicio`}
        >
          Norde<span className="text-muted-foreground font-normal"> Propiedades</span>
        </Link>
        <nav aria-label="Principal">
          <ul className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md px-3 py-2 transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
