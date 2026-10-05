'use client';

import { Label } from '@norde/ui/components/label';
import { cn } from '@norde/ui/lib/utils';
import { useId } from 'react';

import { loadBranchOptions, loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import {
  DEVELOPMENTS_PAGE_PARAM,
  HOME_VIEW_VALUES,
  PROPERTIES_PAGE_PARAM,
  type HomeFilterValues,
  type HomeView,
} from '../home-params';

const HOME_VIEW_LABELS: Readonly<Record<HomeView, string>> = {
  pendientes: 'Pendientes',
  estado: 'Estado actual',
};

export interface HomeFilterPermissions {
  /** Filtrar por agente: elegir entre los usuarios (`users:read`). */
  readonly pickUsers: boolean;
  /** Filtrar por sucursal (`branches:read`). */
  readonly pickBranches: boolean;
}

function Toolbar({
  view,
  filters,
  permissions,
  agentLabel,
}: {
  readonly view: HomeView;
  readonly filters: HomeFilterValues;
  readonly permissions: HomeFilterPermissions;
  readonly agentLabel: string | undefined;
}) {
  const id = useId();
  const { setParams } = useListNavigation();

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div role="group" aria-label="Vista de Inicio" className="flex flex-wrap gap-2">
        {HOME_VIEW_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            className={cn(
              'inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium whitespace-nowrap text-secondary-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              view === value &&
                'border-transparent bg-foreground text-background hover:bg-foreground',
            )}
            onClick={() => {
              // Pendientes es la vista por defecto: sin el param en la URL. Las páginas de los
              // listados no viajan a la otra vista.
              setParams({
                vista: value === 'pendientes' ? undefined : value,
                [PROPERTIES_PAGE_PARAM]: undefined,
                [DEVELOPMENTS_PAGE_PARAM]: undefined,
              });
            }}
          >
            {HOME_VIEW_LABELS[value]}
          </button>
        ))}
      </div>

      {(permissions.pickUsers || permissions.pickBranches) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {permissions.pickUsers && (
            <div className="flex flex-col gap-1.5 sm:w-60">
              <Label htmlFor={`${id}-agent`} className="text-xs">
                Agente
              </Label>
              <EntityPicker
                id={`${id}-agent`}
                value={filters.agentId === '' ? undefined : filters.agentId}
                initial={
                  filters.agentId === ''
                    ? undefined
                    : { value: filters.agentId, label: agentLabel ?? 'Agente elegido' }
                }
                onChange={(agentId) => {
                  setParams({ agentId });
                }}
                loadPage={loadUserOptions}
                placeholder="Todos los agentes"
                searchPlaceholder="Buscar agente"
                clearLabel="Quitar el agente"
              />
            </div>
          )}
          {permissions.pickBranches && (
            <div className="flex flex-col gap-1.5 sm:w-60">
              <Label htmlFor={`${id}-branch`} className="text-xs">
                Sucursal
              </Label>
              <EntityPicker
                id={`${id}-branch`}
                value={filters.branchId === '' ? undefined : filters.branchId}
                initial={
                  filters.branchId === ''
                    ? undefined
                    : { value: filters.branchId, label: 'Sucursal elegida' }
                }
                onChange={(branchId) => {
                  setParams({ branchId });
                }}
                loadPage={loadBranchOptions}
                placeholder="Todas las sucursales"
                searchPlaceholder="Buscar sucursal"
                clearLabel="Quitar la sucursal"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Pendientes / Estado actual y los filtros de agente y sucursal (según permisos), en la URL. */
export function HomeToolbar(props: {
  readonly view: HomeView;
  readonly filters: HomeFilterValues;
  readonly permissions: HomeFilterPermissions;
  readonly agentLabel: string | undefined;
}) {
  return (
    <ListNavigationProvider>
      <Toolbar {...props} />
    </ListNavigationProvider>
  );
}
