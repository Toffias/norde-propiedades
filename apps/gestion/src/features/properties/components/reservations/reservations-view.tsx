'use client';

import {
  OPERATIONS,
  PROPERTY_TYPES,
  RESERVATION_STATUS_VALUES,
  type ReservationFilter,
  type ReservationListRow,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Label } from '@norde/ui/components/label';
import { Popover, PopoverContent, PopoverTrigger } from '@norde/ui/components/popover';
import { toast } from '@norde/ui/components/sonner';
import { StatusPill } from '@norde/ui/components/status-pill';
import { DownloadIcon, Loader2Icon, PrinterIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';

import { MoreFiltersButton } from '../../../shared/components/more-filters-button';
import { UNEXPECTED_ERROR_MESSAGE } from '../../../../lib/errors';
import { EMPTY_VALUE, formatDate, formatDateOnly } from '../../../../lib/format';
import { DateRange } from '../../../clients/components/clients-toolbar';
import { loadBranchOptions, loadUserOptions } from '../../../identity/actions';
import { EntityPicker } from '../../../identity/components/entity-picker';
import { FilterSelect, options } from '../../../shared/components/list-filters';
import { ServerDataTable, useListNavigation } from '../../../shared/components/server-data-table';
import { OPERATION_LABELS, PROPERTY_TYPE_LABELS, RESERVATION_STATUS_DISPLAY } from '../../labels';
import { reservationAmount, reservationClient, reservationCommission } from './reservation-format';

/** Filtros del listado tal como están en la URL (texto, sin parsear). */
export interface ReservationFilterValues {
  readonly status: string;
  readonly operation: string;
  readonly propertyType: string;
  readonly agentId: string;
  readonly managerId: string;
  readonly branchId: string;
  readonly reservedFrom: string;
  readonly reservedTo: string;
  readonly signingFrom: string;
  readonly signingTo: string;
}

export interface ReservationListPermissions {
  /** Exportar a Excel (`reservations:export`). */
  readonly export: boolean;
  /** Filtrar por agente o gerente: elegir entre los usuarios (`users:read`). */
  readonly pickUsers: boolean;
  /** Filtrar por sucursal (`branches:read`). */
  readonly pickBranches: boolean;
}

/** Los nombres de los usuarios filtrados, si se conocen (para los selectores). */
export interface ReservationFilterLabels {
  readonly agent: string | undefined;
  readonly manager: string | undefined;
}

function propertyHref(row: ReservationListRow): Route {
  // La pestaña Reservas de la ficha: typedRoutes no verifica un segmento dinámico armado.
  return `/propiedades/${row.property.id}?tab=reservas` as Route;
}

/** Los filtros aplicados, para exportar: viaja el filtro, nunca la lista de reservas. */
function toReservationFilter(filters: ReservationFilterValues): ReservationFilter {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
}

const ATTACHMENT_NAME = /filename="([^"]+)"/;

/** Pide la exportación y la descarga. Un error esperado vuelve como JSON con su mensaje. */
async function download(filter: ReservationFilter) {
  const response = await fetch('/reservas/exportar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : UNEXPECTED_ERROR_MESSAGE;
    throw new Error(message);
  }
  const name =
    ATTACHMENT_NAME.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'reservas.xlsx';
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Imprime la página en tema claro: en papel, el oscuro sale ilegible. */
function printLight() {
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'light');
    window.addEventListener(
      'afterprint',
      () => {
        root.setAttribute('data-theme', theme);
      },
      { once: true },
    );
  }
  window.print();
}

/** Agente, gerente, sucursal y fechas: los filtros menos usados, en un popover. */
function MoreFilters({
  filters,
  permissions,
  labels,
}: {
  readonly filters: ReservationFilterValues;
  readonly permissions: ReservationListPermissions;
  readonly labels: ReservationFilterLabels;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  const active = [
    filters.agentId,
    filters.managerId,
    filters.branchId,
    filters.reservedFrom,
    filters.reservedTo,
    filters.signingFrom,
    filters.signingTo,
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
              <Label htmlFor={`${id}-agent`} className="text-xs">
                Agente
              </Label>
              <EntityPicker
                id={`${id}-agent`}
                value={filters.agentId === '' ? undefined : filters.agentId}
                initial={
                  filters.agentId === ''
                    ? undefined
                    : { value: filters.agentId, label: labels.agent ?? 'Agente elegido' }
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-manager`} className="text-xs">
                Gerente
              </Label>
              <EntityPicker
                id={`${id}-manager`}
                value={filters.managerId === '' ? undefined : filters.managerId}
                initial={
                  filters.managerId === ''
                    ? undefined
                    : { value: filters.managerId, label: labels.manager ?? 'Gerente elegido' }
                }
                onChange={(managerId) => {
                  setParams({ managerId });
                }}
                loadPage={loadUserOptions}
                placeholder="Todos los gerentes"
                searchPlaceholder="Buscar gerente"
                clearLabel="Quitar el gerente"
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
        <DateRange
          label="Fecha de reserva"
          from={{ param: 'reservedFrom', value: filters.reservedFrom }}
          to={{ param: 'reservedTo', value: filters.reservedTo }}
        />
        <DateRange
          label="Fecha estimada de firma"
          from={{ param: 'signingFrom', value: filters.signingFrom }}
          to={{ param: 'signingTo', value: filters.signingTo }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Estado, operación, tipo de propiedad y más filtros. */
function Toolbar({
  filters,
  permissions,
  labels,
}: {
  readonly filters: ReservationFilterValues;
  readonly permissions: ReservationListPermissions;
  readonly labels: ReservationFilterLabels;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
      <FilterSelect
        param="status"
        value={filters.status}
        label="Estado de la reserva"
        anyLabel="Todos los estados"
        options={RESERVATION_STATUS_VALUES.map((value) => ({
          value,
          label: RESERVATION_STATUS_DISPLAY[value].label,
        }))}
      />
      <FilterSelect
        param="operation"
        value={filters.operation}
        label="Operación"
        anyLabel="Todas las operaciones"
        options={options(OPERATIONS, OPERATION_LABELS)}
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

/** Exportar a Excel (con los filtros aplicados) e imprimir la página. */
function ActionsBar({
  filters,
  permissions,
  total,
}: {
  readonly filters: ReservationFilterValues;
  readonly permissions: ReservationListPermissions;
  readonly total: number;
}) {
  const [exporting, startExport] = useTransition();

  function exportAll() {
    startExport(async () => {
      const toastId = toast.loading('Preparando la planilla…');
      try {
        await download(toReservationFilter(filters));
        toast.success('Exportación lista', { id: toastId });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : UNEXPECTED_ERROR_MESSAGE, {
          id: toastId,
        });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 print:hidden">
      <p className="text-sm text-muted-foreground tabular-nums">
        {total === 1 ? '1 reserva' : `${total.toLocaleString('es-AR')} reservas`}
      </p>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={total === 0} onClick={printLight}>
          <PrinterIcon className="h-4 w-4" />
          Imprimir
        </Button>
        {permissions.export && (
          <Button
            type="button"
            variant="outline"
            disabled={exporting || total === 0}
            onClick={exportAll}
          >
            {exporting ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <DownloadIcon className="h-4 w-4" />
            )}
            Exportar a Excel
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Listado de reservas: grilla paginada en el servidor con filtros, exportación a Excel e
 * impresión. Cada fila abre la pestaña Reservas de la propiedad.
 */
export function ReservationsView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  permissions,
  labels,
}: {
  readonly rows: readonly ReservationListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: ReservationFilterValues;
  readonly permissions: ReservationListPermissions;
  readonly labels: ReservationFilterLabels;
}) {
  const router = useRouter();
  const hasFilters = Object.values(filters).some((value) => value !== '');

  const columns: readonly DataTableColumn<ReservationListRow>[] = [
    {
      id: 'property',
      header: 'Propiedad',
      className: 'whitespace-normal',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={propertyHref(row)}
            className="font-medium text-primary-700 tabular-nums hover:underline dark:text-primary-400"
          >
            {row.property.code}
          </Link>
          <span
            className="block max-w-[160px] truncate text-xs text-muted-foreground sm:max-w-[240px]"
            title={row.property.address}
          >
            {PROPERTY_TYPE_LABELS[row.property.propertyType]} · {row.property.address}
          </span>
        </div>
      ),
    },
    {
      id: 'client',
      header: 'Cliente',
      className: 'whitespace-normal',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <Link
            // La ficha del contacto: typedRoutes no verifica un segmento armado.
            href={`/contactos/${row.client.id}` as Route}
            className="font-medium hover:underline"
          >
            {reservationClient(row)}
          </Link>
          <span className="text-xs text-muted-foreground">{OPERATION_LABELS[row.operation]}</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (row) => {
        const status = RESERVATION_STATUS_DISPLAY[row.status];
        return (
          <span title={row.fallenReason}>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </span>
        );
      },
    },
    {
      id: 'agent',
      header: 'Agente',
      showFrom: 'lg',
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span>{row.agent?.name ?? EMPTY_VALUE}</span>
          {row.manager !== undefined && (
            <span className="text-xs text-muted-foreground">
              Gerente: {row.manager.name ?? 'usuario inactivo'}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'amount',
      header: 'Valor',
      showFrom: 'md',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => reservationAmount(row),
    },
    {
      id: 'commission',
      header: 'Comisión',
      showFrom: 'xl',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => reservationCommission(row),
    },
    {
      id: 'reservedAt',
      header: 'Reservada',
      sortable: true,
      showFrom: 'sm',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => formatDate(row.reservedAt),
    },
    {
      id: 'estimatedSigningDate',
      header: 'Firma estimada',
      sortable: true,
      showFrom: 'md',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => formatDateOnly(row.estimatedSigningDate),
    },
  ];

  return (
    <>
      <ActionsBar filters={filters} permissions={permissions} total={total} />
      <ServerDataTable
        label="Reservas"
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
            window.open(propertyHref(row), '_blank', 'noopener');
            return;
          }
          router.push(propertyHref(row));
        }}
        toolbar={<Toolbar filters={filters} permissions={permissions} labels={labels} />}
        empty={
          hasFilters
            ? 'No hay reservas que coincidan con los filtros.'
            : 'Todavía no hay reservas. Se reserva desde la ficha de una propiedad disponible.'
        }
      />
    </>
  );
}
