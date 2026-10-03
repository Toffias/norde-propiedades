'use client';

import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { CompanyFeatures } from '../../../config/env';

// Secciones de "Mi empresa" como pestañas con link: cada una es su propia ruta (se puede compartir
// y volver atrás). Las que todavía no tienen pantalla se ven deshabilitadas, y las que Norde no usa
// (#50) no se muestran mientras su variable de entorno esté apagada.

interface CompanySection {
  readonly label: string;
  /** Sin ruta: todavía no tiene pantalla. */
  readonly href?: Route;
  /** Se muestra solo con esa función prendida. */
  readonly feature?: keyof CompanyFeatures;
}

const SECTIONS: readonly CompanySection[] = [
  { label: 'General', href: '/mi-empresa/general' },
  { label: 'Marca de agua', href: '/mi-empresa/marca-de-agua', feature: 'watermark' },
  { label: 'Portales', href: '/mi-empresa/portales' },
  { label: 'Email', href: '/mi-empresa/email' },
  { label: 'Códigos', href: '/mi-empresa/codigos', feature: 'referenceCodes' },
  { label: 'Ficha y PDF', href: '/mi-empresa/ficha-pdf' },
  { label: 'Archivos', href: '/mi-empresa/archivos' },
  { label: 'Propiedades', href: '/mi-empresa/propiedades' },
  { label: 'Ubicaciones', href: '/mi-empresa/ubicaciones' },
  { label: 'Servicios y ambientes', href: '/mi-empresa/caracteristicas' },
  { label: 'Etiquetas', href: '/mi-empresa/etiquetas' },
  { label: 'Oportunidades', href: '/mi-empresa/oportunidades' },
  { label: 'Usuarios', href: '/mi-empresa/usuarios' },
  { label: 'Roles', href: '/mi-empresa/roles' },
  { label: 'Sucursales', href: '/mi-empresa/sucursales' },
  { label: 'Equipos', href: '/mi-empresa/equipos', feature: 'teams' },
];

const PILL =
  'inline-flex items-center justify-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none';

export function CompanyTabs({ features }: { readonly features: CompanyFeatures }) {
  const pathname = usePathname();
  const sections = SECTIONS.filter(
    (section) => section.feature === undefined || features[section.feature],
  );

  return (
    <nav aria-label="Secciones de Mi empresa" className="flex flex-wrap items-center gap-2">
      {sections.map((section) => {
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
