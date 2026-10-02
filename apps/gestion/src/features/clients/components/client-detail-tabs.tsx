import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';

export const CLIENT_DETAIL_TABS = [
  'detalles',
  'actividad',
  'oportunidades',
  'destacadas',
  'busquedas',
  'propiedades',
  'ofrecer',
  'historial',
] as const;
export type ClientDetailTab = (typeof CLIENT_DETAIL_TABS)[number];

export const CLIENT_DETAIL_TAB_LABELS: Readonly<Record<ClientDetailTab, string>> = {
  detalles: 'Detalles',
  actividad: 'Actividad',
  oportunidades: 'Oportunidades',
  destacadas: 'Destacadas',
  busquedas: 'Búsquedas',
  propiedades: 'Propiedades',
  ofrecer: 'Ofrecer',
  historial: 'Historial',
};

export interface ClientDetailTabItem {
  readonly id: ClientDetailTab;
  /** Contador de la pestaña; sin contador, no se muestra. */
  readonly count?: number | undefined;
}

/** Pestañas de la ficha. Viven en la URL (`?tab=actividad`): se pueden compartir y recargar. */
export function ClientDetailTabs({
  clientId,
  active,
  tabs,
}: {
  readonly clientId: string;
  readonly active: ClientDetailTab;
  readonly tabs: readonly ClientDetailTabItem[];
}) {
  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
              href={
                `/contactos/${clientId}${tab.id === 'detalles' ? '' : `?tab=${tab.id}`}` as Route
              }
              aria-current={tab.id === active ? 'page' : undefined}
              scroll={false}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                tab.id === active && 'bg-background text-foreground shadow-sm dark:bg-card',
              )}
            >
              {CLIENT_DETAIL_TAB_LABELS[tab.id]}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full bg-background/70 px-1.5 text-xs tabular-nums dark:bg-muted',
                    tab.id === active && 'bg-muted dark:bg-background',
                  )}
                >
                  {tab.count.toLocaleString('es-AR')}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
