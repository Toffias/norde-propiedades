'use client';

import type { OpportunitySortField } from '@norde/core/clients/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { cn } from '@norde/ui/lib/utils';
import { HandshakeIcon, ListIcon, SquareKanbanIcon } from 'lucide-react';
import type { Route } from 'next';
import type { ReactNode } from 'react';

import { sortParam } from '../../../lib/list-params';
import { useListNavigation } from '../../shared/components/server-data-table';

// Lo que comparten la lista y el tablero del pipeline.

export interface OpportunitySort {
  readonly field: OpportunitySortField;
  readonly direction: 'asc' | 'desc';
}

/** Los órdenes que se ofrecen, ya con su dirección (así viajan en la URL). */
const SORT_OPTIONS: readonly (OpportunitySort & { readonly label: string })[] = [
  { field: 'updatedAt', direction: 'desc', label: 'Actualizadas recientemente' },
  { field: 'statusChangedAt', direction: 'asc', label: 'Más tiempo en el estado' },
  { field: 'createdAt', direction: 'desc', label: 'Creadas recientemente' },
  { field: 'createdAt', direction: 'asc', label: 'Más antiguas' },
  { field: 'clientName', direction: 'asc', label: 'Contacto (A–Z)' },
];

export function daysLabel(days: number): string {
  if (days === 0) return 'Hoy';
  return days === 1 ? '1 día' : `${days.toLocaleString('es-AR')} días`;
}

export function contactHref(clientId: string): Route {
  // La ficha del contacto en su pestaña de oportunidades: typedRoutes no verifica un string armado.
  return `/contactos/${clientId}?tab=oportunidades` as Route;
}

export function OpportunitySortSelect({
  sort,
  className,
}: {
  readonly sort: OpportunitySort;
  readonly className?: string;
}) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={sortParam(sort)}
      onValueChange={(next) => {
        setParams({ sort: next });
      }}
    >
      <SelectTrigger className={cn('h-8 w-full sm:w-[240px]', className)} aria-label="Ordenar">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => {
          const value = sortParam(option);
          return (
            <SelectItem key={value} value={value}>
              {option.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/** Lista, tablero, o la lista de las derivadas a socias (un filtro por categoría). */
export type OpportunityView = 'list' | 'board' | 'referred';

const VIEW_OPTIONS = [
  { value: 'list', label: 'Lista', icon: ListIcon },
  { value: 'board', label: 'Tablero', icon: SquareKanbanIcon },
  { value: 'referred', label: 'Derivadas', icon: HandshakeIcon },
] as const;

/**
 * Lista, tablero (`?vista=tablero`) o derivadas a socias (la lista con la categoría "Aplica a otra
 * inmobiliaria"). Los demás filtros y el orden se mantienen.
 */
export function OpportunityViewToggle({ view }: { readonly view: OpportunityView }) {
  const { setParams, pending } = useListNavigation();
  return (
    <div
      role="group"
      aria-label="Vista"
      className="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-card p-0.5"
    >
      {VIEW_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = value === view;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={pending}
            className={cn(
              'inline-flex h-full items-center gap-1.5 rounded-[5px] px-2.5 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              if (active) return;
              // Cada vista arranca sin sección abierta ni páginas (en el tablero, cada columna
              // pagina sola). Salir de "Derivadas" quita su categoría.
              setParams({
                vista: value === 'board' ? 'tablero' : undefined,
                ...(value === 'referred'
                  ? { category: 'referred_to_partner' }
                  : view === 'referred'
                    ? { category: undefined }
                    : {}),
                stageId: undefined,
                page: undefined,
                pageSize: undefined,
              });
            }}
          >
            <Icon className="h-4 w-4" />
            <span className={cn(value !== view && 'hidden sm:inline')}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Los filtros y, a la derecha (arriba en mobile), el cambio de vista. */
export function PipelineToolbar({
  view,
  children,
}: {
  readonly view: OpportunityView;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex justify-end">
        <OpportunityViewToggle view={view} />
      </div>
    </div>
  );
}
