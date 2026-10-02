'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { GridColumnValue, PanelPropertyRow } from '@norde/core/properties/contracts';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { StatusPill } from '@norde/ui/components/status-pill';
import { ArchiveRestoreIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDateTime } from '../../../lib/format';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { deletePropertyAction, restorePropertyAction } from '../actions';
import {
  GRID_COLUMN_LABELS,
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
} from '../labels';
import { gridColumnValue, operationPrice, placeSummary, userName } from '../property-format';
import { FavoriteToggle } from './favorite-toggle';
import { PropertyBulkActions, type BulkPermissions } from './property-bulk-actions';
import type { PropertyFilterValues } from './properties-toolbar';

export interface PropertyPermissions extends BulkPermissions {
  readonly create: boolean;
  /** Borrar o restaurar: el caso de uso decide sobre cada propiedad (propias o de otros). */
  readonly delete: boolean;
}

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function getRowId(row: PanelPropertyRow): string {
  return row.id;
}

function detailHref(row: PanelPropertyRow): Route {
  // La ficha de la fila: typedRoutes no verifica un segmento dinámico armado.
  return `/propiedades/${row.id}` as Route;
}

function OperationsCell({ row }: { readonly row: PanelPropertyRow }) {
  if (row.operations.length === 0) {
    return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {row.operations.map((operation) => (
        <li key={operation.operation} className="whitespace-nowrap">
          <span className="text-muted-foreground">{OPERATION_LABELS[operation.operation]}</span>{' '}
          <span className="font-medium tabular-nums">{operationPrice(operation)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Las columnas que se ordenan en el servidor, por su ID en la grilla. */
const SORTABLE: ReadonlySet<string> = new Set(['code', 'createdAt', 'updatedAt']);

/**
 * Vista de lista del buscador: columnas fijas (código, propiedad, operación y precio, estado) más
 * las que elige la inmobiliaria en Mi empresa. Con selección para las acciones masivas.
 */
export function PropertiesGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  permissions,
  gridColumns,
  favoriteIds,
  toolbar,
}: {
  readonly rows: readonly PanelPropertyRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: PropertyFilterValues;
  readonly permissions: PropertyPermissions;
  readonly gridColumns: readonly GridColumnValue[];
  readonly favoriteIds: ReadonlySet<string>;
  readonly toolbar: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | undefined>();
  const inTrash = filters.view === 'trash';
  // El orden por precio compara una sola moneda: solo se ofrece con la moneda elegida.
  const canSortByPrice = filters.currency !== '';
  const hasFilters = Object.entries(filters).some(
    ([key, value]) => key !== 'view' && key !== 'scope' && value !== '',
  );

  const columns = useMemo((): readonly DataTableColumn<PanelPropertyRow>[] => {
    const configurable = inTrash
      ? []
      : gridColumns.map((column): DataTableColumn<PanelPropertyRow> => ({
          id: column,
          header: GRID_COLUMN_LABELS[column],
          sortable: SORTABLE.has(column),
          showFrom: 'lg',
          className: 'whitespace-nowrap text-muted-foreground tabular-nums',
          cell: (row) => gridColumnValue(row, column),
        }));
    return [
      ...(inTrash
        ? []
        : [
            {
              id: 'favorite',
              header: 'Favorita',
              hideHeader: true,
              className: 'w-10 pr-0',
              cell: (row: PanelPropertyRow) => (
                <FavoriteToggle
                  propertyId={row.id}
                  code={row.code}
                  favorite={favoriteIds.has(row.id)}
                />
              ),
            },
          ]),
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
        id: 'title',
        header: 'Propiedad',
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium" title={row.portalTitle}>
              {row.portalTitle}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {PROPERTY_TYPE_LABELS[row.propertyType]} · {placeSummary(row)}
            </span>
          </div>
        ),
      },
      {
        id: 'price',
        header: 'Operación y precio',
        sortable: canSortByPrice,
        showFrom: 'md',
        cell: (row) => <OperationsCell row={row} />,
      },
      {
        id: 'status',
        header: 'Estado',
        className: 'w-[130px]',
        cell: (row) => (
          <StatusPill tone={PROPERTY_STATUS_DISPLAY[row.status].tone}>
            {PROPERTY_STATUS_DISPLAY[row.status].label}
          </StatusPill>
        ),
      },
      ...configurable,
      ...(inTrash
        ? [
            {
              id: 'deletedAt',
              header: 'Borrada',
              showFrom: 'lg' as const,
              className: 'w-[200px] text-muted-foreground',
              cell: (row: PanelPropertyRow) => (
                <div className="flex flex-col">
                  <span className="tabular-nums">{formatDateTime(row.deletedAt)}</span>
                  <span className="text-xs">por {userName(row.deletedBy)}</span>
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
          permissions.delete && (
            <RowActions>
              {inTrash ? (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Restaurar propiedad',
                        description: `${row.code} vuelve a la cartera.`,
                        confirm: 'Restaurar',
                        done: 'Propiedad restaurada',
                      },
                      run: () => restorePropertyAction({ propertyId: row.id }),
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
                        title: 'Borrar propiedad',
                        description: `${row.code} va a la papelera; desde ahí la podés restaurar.`,
                        confirm: 'Borrar',
                        done: 'Propiedad enviada a la papelera',
                        destructive: true,
                      },
                      run: () => deletePropertyAction({ propertyId: row.id }),
                    });
                  }}
                />
              )}
            </RowActions>
          ),
      },
    ];
  }, [canSortByPrice, inTrash, permissions.delete, gridColumns, favoriteIds]);

  return (
    <>
      <ServerDataTable
        label={inTrash ? 'Papelera de propiedades' : 'Propiedades'}
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        selectable={!inTrash}
        onRowClick={(row, event) => {
          // Como un link: con Ctrl o Cmd, la ficha se abre en otra pestaña.
          if (event.ctrlKey || event.metaKey) {
            window.open(detailHref(row), '_blank', 'noopener');
            return;
          }
          router.push(detailHref(row));
        }}
        bulkActions={(selection, count) => (
          <PropertyBulkActions
            selection={selection}
            count={count}
            filters={filters}
            permissions={permissions}
          />
        )}
        toolbar={toolbar}
        empty={
          inTrash
            ? 'La papelera está vacía.'
            : hasFilters
              ? 'No hay propiedades que coincidan con los filtros.'
              : 'Todavía no hay propiedades en la cartera.'
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
