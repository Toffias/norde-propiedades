'use client';

import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Secciones de "Mi empresa" como pestañas con link: cada una es su propia ruta (se puede compartir
// y volver atrás). Las que todavía no tienen pantalla se ven deshabilitadas.

interface CompanySection {
  readonly label: string;
  /** Sin ruta: todavía no tiene pantalla. */
  readonly href?: Route;
}

const SECTIONS: readonly CompanySection[] = [
  { label: 'Usuarios', href: '/mi-empresa/usuarios' },
  { label: 'Roles' },
  { label: 'Sucursales' },
  { label: 'Equipos' },
];

const PILL =
  'inline-flex items-center justify-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none';

export function CompanyTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Secciones de Mi empresa" className="flex flex-wrap items-center gap-2">
      {SECTIONS.map((section) => {
        if (section.href === undefined) {
          return (
            <span
              key={section.label}
              aria-disabled
              title="Próximamente"
              className={cn(PILL, 'cursor-not-allowed opacity-50')}
            >
              {section.label}
            </span>
          );
        }
        const active = pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              PILL,
              'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active && 'border-transparent bg-foreground text-background hover:bg-foreground',
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
