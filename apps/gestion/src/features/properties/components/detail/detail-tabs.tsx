import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';

import { DETAIL_TAB_LABELS, DETAIL_TABS, type DetailTab } from '../../detail-labels';

/** Pestañas de la ficha. Viven en la URL (`?tab=multimedia`): se pueden compartir y recargar. */
export function DetailTabs({
  propertyId,
  active,
  counts,
  hidden = [],
}: {
  readonly propertyId: string;
  readonly active: DetailTab;
  readonly counts: { readonly media: number; readonly attachments: number };
  /** Pestañas que no se muestran (sin permiso o con la función apagada). */
  readonly hidden?: readonly DetailTab[];
}) {
  const count = (tab: DetailTab) =>
    tab === 'multimedia' ? counts.media : tab === 'archivos' ? counts.attachments : undefined;

  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {DETAIL_TABS.filter((tab) => !hidden.includes(tab)).map((tab) => {
          const current = tab === active;
          const total = count(tab);
          return (
            <li key={tab}>
              <Link
                // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
                href={
                  `/propiedades/${propertyId}${tab === 'detalles' ? '' : `?tab=${tab}`}` as Route
                }
                aria-current={current ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                  current && 'bg-background text-foreground shadow-sm dark:bg-card',
                )}
              >
                {DETAIL_TAB_LABELS[tab]}
                {total !== undefined && total > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{total}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
