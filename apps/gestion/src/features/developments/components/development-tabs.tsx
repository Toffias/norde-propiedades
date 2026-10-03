import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';

import { DEVELOPMENT_TAB_LABELS, DEVELOPMENT_TABS, type DevelopmentTab } from '../labels';

/** Pestañas de la ficha del emprendimiento. Viven en la URL (`?tab=unidades`). */
export function DevelopmentTabs({
  developmentId,
  active,
  unitCount,
  showHistory,
}: {
  readonly developmentId: string;
  readonly active: DevelopmentTab;
  readonly unitCount: number;
  readonly showHistory: boolean;
}) {
  const tabs = DEVELOPMENT_TABS.filter((tab) => tab !== 'historial' || showHistory);
  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {tabs.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
                href={
                  `/emprendimientos/${developmentId}${tab === 'detalles' ? '' : `?tab=${tab}`}` as Route
                }
                aria-current={current ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  current && 'bg-background text-foreground shadow-sm dark:bg-card',
                )}
              >
                {DEVELOPMENT_TAB_LABELS[tab]}
                {tab === 'unidades' && unitCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                    {unitCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
