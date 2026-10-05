'use client';

import {
  CONSTRUCTION_STATUS_VALUES,
  DEVELOPMENT_LAYOUT_VALUES,
  DEVELOPMENT_STATUS_VALUES,
  DEVELOPMENT_TYPES,
  type DevelopmentLayoutValue,
  type DevelopmentRow,
  type DevelopmentViewValue,
} from '@norde/core/properties/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import {
  ArchiveRestoreIcon,
  Building2Icon,
  EyeIcon,
  ListIcon,
  MapIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDateOnly, formatDateTime } from '../../../lib/format';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { PropertyPhoto } from '../../properties/components/property-photo';
import { usePanel } from '../../shared/components/entity-sheet';
import { DebouncedInput, FilterSelect, options } from '../../shared/components/list-filters';
import {
  ListNavigationProvider,
  ServerDataTable,
  useListNavigation,
} from '../../shared/components/server-data-table';
import { deleteDevelopmentAction, restoreDevelopmentAction } from '../actions';
import {
  CONSTRUCTION_STATUS_LABELS,
  DEVELOPMENT_STATUS_DISPLAY,
  DEVELOPMENT_TYPE_LABELS,
} from '../labels';
import { DevelopmentMap } from './development-map';
import { DevelopmentQuickViewDialog } from './development-quick-view';
import { DevelopmentSheet } from './development-sheet';

/** Filtros del listado tal como están en la URL (texto, sin parsear). */
export interface DevelopmentFilterValues {
  readonly q: string;
  readonly status: string;
  readonly developmentType: string;
  readonly constructionStatus: string;
  readonly view: DevelopmentViewValue;
}

export interface DevelopmentPermissions {
  readonly create: boolean;
  readonly delete: boolean;
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function detailHref(row: DevelopmentRow): Route {
  // La ficha de la fila: typedRoutes no verifica un segmento dinámico armado.
  return `/emprendimientos/${row.id}` as Route;
}

const LAYOUTS: Readonly<
  Record<DevelopmentLayoutValue, { readonly label: string; readonly icon: LucideIcon }>
> = {
  list: { label: 'Lista', icon: ListIcon },
  map: { label: 'Mapa', icon: MapIcon },
};

/** Lista o mapa: la vista va en la URL (`?layout=map`), con los mismos filtros. */
function LayoutSwitcher({ layout }: { readonly layout: DevelopmentLayoutValue }) {
  const { setParams } = useListNavigation();
  return (
    <div
      role="group"
      aria-label="Cómo ver los emprendimientos"
      className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5"
    >
      {DEVELOPMENT_LAYOUT_VALUES.map((value) => {
        const { label, icon: Icon } = LAYOUTS[value];
        const active = value === layout;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            title={label}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              setParams({ layout: value === 'list' ? undefined : value });
            }}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Filtros del listado (búsqueda, estado, tipo y obra): debajo de la barra de acciones. */
function Toolbar({ filters }: { readonly filters: DevelopmentFilterValues }) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
      <DebouncedInput
        param="q"
        value={filters.q}
        label="Buscar por código, nombre, dirección o desarrollista"
        placeholder="Código, nombre o dirección"
        icon={SearchIcon}
        className="col-span-2 w-full sm:max-w-[260px]"
      />
      <FilterSelect
        param="status"
        value={filters.status}
        label="Estado"
        anyLabel="Estado"
        options={DEVELOPMENT_STATUS_VALUES.map((value) => ({
          value,
          label: DEVELOPMENT_STATUS_DISPLAY[value].label,
        }))}
        className="w-full sm:w-[200px]"
      />
      <FilterSelect
        param="developmentType"
        value={filters.developmentType}
        label="Tipo de desarrollo"
        anyLabel="Tipo"
        options={options(DEVELOPMENT_TYPES, DEVELOPMENT_TYPE_LABELS)}
      />
      <FilterSelect
        param="constructionStatus"
        value={filters.constructionStatus}
        label="Estado de obra"
        anyLabel="Obra"
        options={options(CONSTRUCTION_STATUS_VALUES, CONSTRUCTION_STATUS_LABELS)}
      />
    </div>
  );
}

/**
 * La barra de acciones, arriba de los filtros: la vista a la izquierda; papelera y alta a la
 * derecha.
 */
function ActionsBar({
  filters,
  layout,
  permissions,
  onCreate,
}: {
  readonly filters: DevelopmentFilterValues;
  readonly layout: DevelopmentLayoutValue;
  readonly permissions: DevelopmentPermissions;
  readonly onCreate: () => void;
}) {
  const { setParams } = useListNavigation();
  const inTrash = filters.view === 'trash';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      {!inTrash && <LayoutSwitcher layout={layout} />}
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {permissions.delete && layout === 'list' && (
          <Button
            variant={inTrash ? 'secondary' : 'ghost'}
            onClick={() => {
              setParams({ view: inTrash ? undefined : 'trash' });
            }}
          >
            <Trash2Icon className="h-4 w-4" />
            {inTrash ? 'Salir de la papelera' : 'Papelera'}
          </Button>
        )}
        {permissions.create && !inTrash && (
          <Button onClick={onCreate}>
            <PlusIcon className="h-4 w-4" />
            Nuevo emprendimiento
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Listado de emprendimientos: grilla paginada en el servidor con búsqueda, filtros y papelera, o
 * mapa con los mismos filtros, más el alta en el panel lateral. Cada fila abre la ficha o la vista
 * rápida.
 */
export function DevelopmentsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  layout,
  permissions,
}: {
  readonly layout: DevelopmentLayoutValue;
  readonly rows: readonly DevelopmentRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: DevelopmentFilterValues;
  readonly permissions: DevelopmentPermissions;
}) {
  const router = useRouter();
  const navigation = usePanel();
  const [pending, setPending] = useState<PendingAction | undefined>();
  const [quickView, setQuickView] = useState<string | undefined>();
  const inTrash = filters.view === 'trash';
  // La papelera solo se ve en lista.
  const effectiveLayout = inTrash ? 'list' : layout;
  const hasFilters = [
    filters.q,
    filters.status,
    filters.developmentType,
    filters.constructionStatus,
  ].some((value) => value !== '');

  const columns = useMemo(
    (): readonly DataTableColumn<DevelopmentRow>[] => [
      {
        id: 'code',
        header: 'Código',
        sortable: true,
        className: 'w-[110px] font-medium tabular-nums',
        cell: (row) => (
          <Link
            href={detailHref(row)}
            className="text-primary-700 hover:underline dark:text-primary-400"
          >
            {row.code}
          </Link>
        ),
      },
      {
        id: 'name',
        header: 'Emprendimiento',
        sortable: true,
        cell: (row) => (
          <div className="flex min-w-0 items-center gap-3">
            <PropertyPhoto
              propertyId={row.id}
              owner="development"
              cover={row.cover}
              className="size-10 shrink-0 rounded-md bg-muted object-cover"
              fallback={
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                  aria-hidden
                >
                  <Building2Icon className="size-4" />
                </span>
              }
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium" title={row.name}>
                {row.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  row.developmentType === undefined
                    ? undefined
                    : DEVELOPMENT_TYPE_LABELS[row.developmentType],
                  row.publishAddress,
                ]
                  .filter((part) => part !== undefined && part !== '')
                  .join(' · ') || EMPTY_VALUE}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Estado',
        className: 'w-[170px]',
        cell: (row) => (
          <StatusPill tone={DEVELOPMENT_STATUS_DISPLAY[row.status].tone}>
            {DEVELOPMENT_STATUS_DISPLAY[row.status].label}
          </StatusPill>
        ),
      },
      {
        id: 'deliveryDate',
        header: 'Entrega',
        sortable: true,
        showFrom: 'md',
        className: 'w-[150px] whitespace-nowrap',
        cell: (row) => (
          <div className="flex flex-col">
            <span className="tabular-nums">{formatDateOnly(row.deliveryDate)}</span>
            {row.constructionStatus !== undefined && (
              <span className="text-xs text-muted-foreground">
                {CONSTRUCTION_STATUS_LABELS[row.constructionStatus]}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'units',
        header: 'Unidades',
        showFrom: 'lg',
        className: 'w-[90px] text-right tabular-nums',
        cell: (row) => row.unitCount,
      },
      {
        id: 'tags',
        header: 'Etiquetas',
        showFrom: 'lg',
        cell: (row) =>
          row.tags.length === 0 ? (
            <span className="text-muted-foreground">{EMPTY_VALUE}</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: 'websiteUrl',
        header: 'Página web',
        showFrom: 'xl',
        className: 'max-w-[180px]',
        cell: (row) =>
          row.websiteUrl === undefined ? (
            <span className="text-muted-foreground">{EMPTY_VALUE}</span>
          ) : (
            <a
              href={row.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-primary-700 hover:underline dark:text-primary-400"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              {row.websiteUrl.replace(/^https?:\/\//, '')}
            </a>
          ),
      },
      ...(inTrash
        ? [
            {
              id: 'deletedAt',
              header: 'Borrado',
              showFrom: 'lg' as const,
              className: 'w-[200px] text-muted-foreground',
              cell: (row: DevelopmentRow) => (
                <div className="flex flex-col">
                  <span className="tabular-nums">{formatDateTime(row.deletedAt)}</span>
                  <span className="text-xs">
                    por {row.deletedBy?.name ?? 'un usuario inactivo'}
                  </span>
                </div>
              ),
            },
          ]
        : []),
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (row) =>
          (permissions.delete || !inTrash) && (
            <RowActions>
              {!inTrash && (
                <RowAction
                  icon={EyeIcon}
                  label="Vista rápida"
                  onClick={() => {
                    setQuickView(row.id);
                  }}
                />
              )}
              {!permissions.delete ? null : inTrash ? (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Restaurar emprendimiento',
                        description: `${row.name} vuelve al listado.`,
                        confirm: 'Restaurar',
                        done: 'Emprendimiento restaurado',
                      },
                      run: () => restoreDevelopmentAction({ developmentId: row.id }),
                    });
                  }}
                />
              ) : (
                <RowAction
                  icon={Trash2Icon}
                  label="Borrar"
                  destructive
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Borrar emprendimiento',
                        description: `${row.name} va a la papelera; desde ahí lo podés restaurar. Si tiene unidades activas, primero hay que borrarlas.`,
                        confirm: 'Borrar',
                        done: 'Emprendimiento enviado a la papelera',
                        destructive: true,
                      },
                      run: () => deleteDevelopmentAction({ developmentId: row.id }),
                    });
                  }}
                />
              )}
            </RowActions>
          ),
      },
    ],
    [inTrash, permissions.delete],
  );

  const toolbar = <Toolbar filters={filters} />;

  return (
    <>
      <ListNavigationProvider>
        <ActionsBar
          filters={filters}
          layout={effectiveLayout}
          permissions={permissions}
          onCreate={navigation.openNew}
        />
      </ListNavigationProvider>
      {effectiveLayout === 'map' ? (
        <ListNavigationProvider>
          <DevelopmentMap filters={filters} toolbar={toolbar} />
        </ListNavigationProvider>
      ) : (
        <ServerDataTable
          label={inTrash ? 'Papelera de emprendimientos' : 'Emprendimientos'}
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          getRowId={(row) => row.id}
          onRowClick={(row, event) => {
            // Como un link: con Ctrl o Cmd, la ficha se abre en otra pestaña.
            if (event.ctrlKey || event.metaKey) {
              window.open(detailHref(row), '_blank', 'noopener');
              return;
            }
            router.push(detailHref(row));
          }}
          toolbar={toolbar}
          empty={
            inTrash
              ? 'La papelera está vacía.'
              : hasFilters
                ? 'No hay emprendimientos que coincidan con los filtros.'
                : 'Todavía no hay emprendimientos cargados.'
          }
        />
      )}
      <DevelopmentQuickViewDialog
        developmentId={quickView}
        onClose={() => {
          setQuickView(undefined);
        }}
      />
      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
      {permissions.create && <DevelopmentSheet navigation={navigation} />}
    </>
  );
}
