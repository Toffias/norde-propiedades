'use client';

import {
  APPRAISAL_STATUS_GROUP_VALUES,
  PROPERTY_TYPES,
  type AppraisalListRow,
  type AppraisalViewValue,
} from '@norde/core/appraisals/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { StatusPill } from '@norde/ui/components/status-pill';
import { ArchiveRestoreIcon, HouseIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';

import { MoreFiltersButton } from '../../shared/components/more-filters-button';
import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDate, formatDateTime } from '../../../lib/format';
import { DateRange } from '../../clients/components/clients-toolbar';
import { loadBranchOptions, loadUserOptions } from '../../identity/actions';
import { EntityPicker } from '../../identity/components/entity-picker';
import { FallbackImage } from '../../properties/components/property-photo';
import { PROPERTY_TYPE_LABELS } from '../../properties/labels';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { FilterSelect, options } from '../../shared/components/list-filters';
import {
  ListNavigationProvider,
  ServerDataTable,
  useListNavigation,
} from '../../shared/components/server-data-table';
import { deleteAppraisalAction, restoreAppraisalAction } from '../actions';
import { APPRAISAL_STATUS_DISPLAY, APPRAISAL_STATUS_GROUP_LABELS } from '../labels';
import { appraisalPhotoHref } from '../paths';

/** Filtros del listado tal como están en la URL (texto, sin parsear). */
export interface AppraisalFilterValues {
  readonly view: AppraisalViewValue;
  readonly status: string;
  readonly propertyType: string;
  readonly producerId: string;
  readonly appraiserId: string;
  readonly branchId: string;
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly visitFrom: string;
  readonly visitTo: string;
}

export interface AppraisalListPermissions {
  readonly create: boolean;
  /** Borrar, restaurar y ver la papelera (`appraisals:delete`). */
  readonly delete: boolean;
  /** Filtrar por productor o tasador (`users:read`). */
  readonly pickUsers: boolean;
  /** Filtrar por sucursal (`branches:read`). */
  readonly pickBranches: boolean;
}

/** Los nombres de los usuarios y la sucursal filtrados, si se conocen (para los selectores). */
export interface AppraisalFilterLabels {
  readonly producer: string | undefined;
  readonly appraiser: string | undefined;
  readonly branch: string | undefined;
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function detailHref(row: AppraisalListRow): Route {
  // La ficha de la fila: typedRoutes no verifica un segmento dinámico armado.
  return `/tasaciones/${row.id}` as Route;
}

/** Productor, tasador, sucursal y fechas: los filtros menos usados, en un popover. */
function MoreFilters({
  filters,
  permissions,
  labels,
}: {
  readonly filters: AppraisalFilterValues;
  readonly permissions: AppraisalListPermissions;
  readonly labels: AppraisalFilterLabels;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  const active = [
    filters.producerId,
    filters.appraiserId,
    filters.branchId,
    filters.createdFrom,
    filters.createdTo,
    filters.visitFrom,
    filters.visitTo,
  ].filter((value) => value !== '').length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <MoreFiltersButton active={active} />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(92vw,340px)] flex-col gap-4">
        {permissions.pickUsers && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-producer`} className="text-xs">
                Productor
              </Label>
              <EntityPicker
                id={`${id}-producer`}
                value={filters.producerId === '' ? undefined : filters.producerId}
                initial={
                  filters.producerId === ''
                    ? undefined
                    : { value: filters.producerId, label: labels.producer ?? 'Productor elegido' }
                }
                onChange={(producerId) => {
                  setParams({ producerId });
                }}
                loadPage={loadUserOptions}
                placeholder="Todos los productores"
                searchPlaceholder="Buscar productor"
                clearLabel="Quitar el productor"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-appraiser`} className="text-xs">
                Tasador
              </Label>
              <EntityPicker
                id={`${id}-appraiser`}
                value={filters.appraiserId === '' ? undefined : filters.appraiserId}
                initial={
                  filters.appraiserId === ''
                    ? undefined
                    : { value: filters.appraiserId, label: labels.appraiser ?? 'Tasador elegido' }
                }
                onChange={(appraiserId) => {
                  setParams({ appraiserId });
                }}
                loadPage={loadUserOptions}
                placeholder="Todos los tasadores"
                searchPlaceholder="Buscar tasador"
                clearLabel="Quitar el tasador"
              />
            </div>
          </>
        )}
        {permissions.pickBranches && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-branch`} className="text-xs">
              Sucursal
            </Label>
            <EntityPicker
              id={`${id}-branch`}
              value={filters.branchId === '' ? undefined : filters.branchId}
              initial={
                filters.branchId === ''
                  ? undefined
                  : { value: filters.branchId, label: labels.branch ?? 'Sucursal elegida' }
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
        <DateRange
          label="Fecha de alta"
          from={{ param: 'createdFrom', value: filters.createdFrom }}
          to={{ param: 'createdTo', value: filters.createdTo }}
        />
        <DateRange
          label="Fecha de visita"
          from={{ param: 'visitFrom', value: filters.visitFrom }}
          to={{ param: 'visitTo', value: filters.visitTo }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Estado, tipo de propiedad y más filtros. */
function Toolbar({
  filters,
  permissions,
  labels,
}: {
  readonly filters: AppraisalFilterValues;
  readonly permissions: AppraisalListPermissions;
  readonly labels: AppraisalFilterLabels;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
      <FilterSelect
        param="status"
        value={filters.status}
        label="Estado"
        anyLabel="Todos los estados"
        options={options(APPRAISAL_STATUS_GROUP_VALUES, APPRAISAL_STATUS_GROUP_LABELS)}
      />
      <FilterSelect
        param="propertyType"
        value={filters.propertyType}
        label="Tipo de propiedad"
        anyLabel="Todos los tipos"
        options={options(PROPERTY_TYPES, PROPERTY_TYPE_LABELS)}
      />
      <MoreFilters filters={filters} permissions={permissions} labels={labels} />
    </div>
  );
}

/** La barra de acciones, arriba de los filtros: papelera y alta a la derecha. */
function ActionsBar({
  filters,
  permissions,
  total,
}: {
  readonly filters: AppraisalFilterValues;
  readonly permissions: AppraisalListPermissions;
  readonly total: number;
}) {
  const { setParams } = useListNavigation();
  const inTrash = filters.view === 'trash';
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        {total === 1 ? '1 tasación' : `${total.toLocaleString('es-AR')} tasaciones`}
      </p>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {permissions.delete && (
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
          <Button asChild>
            <Link href="/tasaciones/nueva">
              <PlusIcon className="h-4 w-4" />
              Nueva tasación
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Listado de tasaciones: grilla paginada en el servidor con filtros y papelera. Cada fila abre la
 * ficha de la tasación.
 */
export function AppraisalsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  permissions,
  labels,
}: {
  readonly rows: readonly AppraisalListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: AppraisalFilterValues;
  readonly permissions: AppraisalListPermissions;
  readonly labels: AppraisalFilterLabels;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | undefined>();
  const inTrash = filters.view === 'trash';
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== 'view' && value !== '');

  const columns = useMemo<readonly DataTableColumn<AppraisalListRow>[]>(
    () => [
      {
        id: 'code',
        header: 'Tasación',
        sortable: true,
        className: 'whitespace-normal',
        cell: (row) => {
          const fallback = (
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
              aria-hidden
            >
              <HouseIcon className="size-4" />
            </span>
          );
          const photo =
            row.coverPhotoId === undefined
              ? undefined
              : appraisalPhotoHref(row.id, row.coverPhotoId);
          return (
            <div className="flex min-w-0 items-center gap-3">
              {photo === undefined ? (
                fallback
              ) : (
                <FallbackImage
                  key={photo}
                  src={photo}
                  className="size-10 shrink-0 rounded-md bg-muted object-cover"
                  fallback={fallback}
                />
              )}
              <div className="flex min-w-0 flex-col">
                <Link
                  href={detailHref(row)}
                  className="font-medium text-primary-700 tabular-nums hover:underline dark:text-primary-400"
                >
                  {row.code}
                </Link>
                <span
                  className="block max-w-[160px] truncate text-xs text-muted-foreground sm:max-w-[240px]"
                  title={row.address}
                >
                  {PROPERTY_TYPE_LABELS[row.propertyType]}
                  {row.address === undefined ? '' : ` · ${row.address}`}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'requester',
        header: 'Solicitante',
        className: 'whitespace-normal',
        cell: (row) => (
          <Link
            // La ficha del contacto: typedRoutes no verifica un segmento armado.
            href={`/contactos/${row.requester.id}` as Route}
            className="font-medium hover:underline"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {row.requester.name ?? 'Contacto sin datos'}
          </Link>
        ),
      },
      {
        id: 'status',
        header: 'Estado',
        cell: (row) => {
          const status = APPRAISAL_STATUS_DISPLAY[row.status];
          return <StatusPill tone={status.tone}>{status.label}</StatusPill>;
        },
      },
      {
        id: 'producer',
        header: 'Productor / tasador',
        showFrom: 'lg',
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span>{row.producer.name ?? 'Usuario inactivo'}</span>
            <span className="text-xs text-muted-foreground">
              Tasador:{' '}
              {row.appraiser === undefined
                ? 'sin asignar'
                : (row.appraiser.name ?? 'usuario inactivo')}
            </span>
          </div>
        ),
      },
      {
        id: 'branch',
        header: 'Sucursal',
        showFrom: 'xl',
        cell: (row) => row.branch?.name ?? EMPTY_VALUE,
      },
      {
        id: 'visitAt',
        header: 'Visita',
        sortable: true,
        showFrom: 'md',
        className: 'whitespace-nowrap tabular-nums',
        cell: (row) => formatDateTime(row.visitAt),
      },
      {
        id: 'createdAt',
        header: 'Alta',
        sortable: true,
        showFrom: 'sm',
        className: 'whitespace-nowrap tabular-nums',
        cell: (row) => formatDate(row.createdAt),
      },
      {
        id: 'actions',
        header: '',
        cell: (row) =>
          permissions.delete && (
            <RowActions>
              {inTrash ? (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Restaurar tasación',
                        description: `${row.code} vuelve al listado.`,
                        confirm: 'Restaurar',
                        done: 'Tasación restaurada',
                      },
                      run: () => restoreAppraisalAction({ appraisalId: row.id }),
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
                        title: 'Borrar tasación',
                        description: `${row.code} va a la papelera; desde ahí la podés restaurar.`,
                        confirm: 'Borrar',
                        done: 'Tasación enviada a la papelera',
                        destructive: true,
                      },
                      run: () => deleteAppraisalAction({ appraisalId: row.id }),
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

  return (
    <>
      <ListNavigationProvider>
        <ActionsBar filters={filters} permissions={permissions} total={total} />
      </ListNavigationProvider>
      <ServerDataTable
        label={inTrash ? 'Papelera de tasaciones' : 'Tasaciones'}
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
        toolbar={<Toolbar filters={filters} permissions={permissions} labels={labels} />}
        empty={
          inTrash
            ? 'La papelera está vacía.'
            : hasFilters
              ? 'No hay tasaciones que coincidan con los filtros.'
              : 'Todavía no hay tasaciones cargadas.'
        }
      />
      <ConfirmActionDialog
        copy={pending?.copy}
        run={pending?.run ?? (() => Promise.resolve({ ok: true }))}
        onOpenChange={(open) => {
          if (!open) setPending(undefined);
        }}
      />
    </>
  );
}
