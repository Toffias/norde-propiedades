'use client';

import { PageHeader } from '@norde/ui/components/page-header';
import { isActivePath } from '@norde/ui/lib/nav';
import { cn } from '@norde/ui/lib/utils';
import { SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { CompanyFeatures } from '../../../config/env';
import { currentCompanyGroup, visibleSections } from '../../shell/company-navigation';

// Cabecera de "Mi empresa": el grupo en el que se está (elegido en el submenú del sidebar) y sus
// secciones como pestañas con link. Un grupo de una sola sección no muestra pestañas.

const PILL =
  'inline-flex items-center justify-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none';

export function CompanyTabs({ features }: { readonly features: CompanyFeatures }) {
  const pathname = usePathname();
  const group = currentCompanyGroup(pathname);
  if (group === undefined) return <PageHeader icon={SettingsIcon} title="Mi empresa" />;
  const sections = visibleSections(group, features);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={SettingsIcon}
        title={`Mi empresa · ${group.label}`}
        subtitle={group.description}
      />
      {sections.length > 1 && (
        <nav
          aria-label={`Secciones de ${group.label}`}
          className="flex flex-wrap items-center gap-2"
        >
          {sections.map((section) => {
            const active = isActivePath(pathname, section.href);
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
      )}
    </div>
  );
}
