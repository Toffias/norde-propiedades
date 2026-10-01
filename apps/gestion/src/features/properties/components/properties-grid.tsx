'use client';

import type { PanelPropertyRow, UserRef } from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { StatusPill } from '@norde/ui/components/status-pill';
import { ArchiveRestoreIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDateTime, formatMoney } from '../../../lib/format';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { usePanel } from '../../shared/components/entity-sheet';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { deletePropertyAction, restorePropertyAction } from '../actions';
import { OPERATION_LABELS, PROPERTY_STATUS_DISPLAY, PROPERTY_TYPE_LABELS } from '../labels';
import { PropertiesToolbar, type PropertyFilterValues } from './properties-toolbar';
import { PropertySheet } from './property-sheet';

export interface PropertyPermissions {
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

/** "Camila Ruiz", o un aviso si el usuario ya no está activo o fue un proceso del sistema. */
function userName(user: UserRef | undefined): string {
  if (user === undefined) return EMPTY_VALUE;
  return user.name ?? 'Usuario inactivo';
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
          <span className="font-medium tabular-nums">
            {operation.priceCents === null
              ? 'Consultar'
              : formatMoney({ amountCents: operation.priceCents, currency: operation.currency })}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PropertiesGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  permissions,
}: {
  readonly rows: readonly PanelPropertyRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: PropertyFilterValues;
  readonly permissions: PropertyPermissions;
}) {
  const [pending, setPending] = useState<PendingAction | undefined>();
  const navigation = usePanel();
  const inTrash = filters.view === 'trash';
  // El orden por precio compara una sola moneda: solo se ofrece con la moneda elegida.
  const canSortByPrice = filters.currency !== '';
  const hasFilters = Object.entries(filters).some(
    ([key, value]) => key !== 'view' && key !== 'scope' && value !== '',
  );

  const columns = useMemo((): readonly DataTableColumn<PanelPropertyRow>[] => {
    return [
      {
        id: 'code',
        header: 'Código',
        sortable: true,
        className: 'w-[110px] font-medium tabular-nums',
        cell: (row) => row.code,
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
              {PROPERTY_TYPE_LABELS[row.propertyType]} ·{' '}
              {[row.publishAddress, row.neighborhood, row.city]
                .filter((part) => part !== undefined && part !== '')
                .join(', ')}
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
      inTrash
        ? {
            id: 'deletedAt',
            header: 'Borrada',
            showFrom: 'lg',
            className: 'w-[200px] text-muted-foreground',
            cell: (row) => (
              <div className="flex flex-col">
                <span className="tabular-nums">{formatDateTime(row.deletedAt)}</span>
                <span className="text-xs">por {userName(row.deletedBy)}</span>
              </div>
            ),
          }
        : {
            id: 'producer',
            header: 'Captador',
            showFrom: 'lg',
            className: 'w-[170px] text-muted-foreground',
            cell: (row) => userName(row.producer),
          },
      {
        id: 'updatedAt',
        header: 'Actualizada',
        sortable: true,
        showFrom: 'xl',
        className: 'w-[170px] text-muted-foreground tabular-nums',
        cell: (row) => formatDateTime(row.updatedAt),
      },
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
  }, [canSortByPrice, inTrash, permissions.delete]);

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
        toolbar={
          <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-start">
            <PropertiesToolbar
              filters={filters}
              sortsByPrice={sort.field === 'price'}
              canSeeTrash={permissions.delete}
            />
            {permissions.create && !inTrash && (
              <Button type="button" className="lg:ml-auto" onClick={navigation.openNew}>
                <PlusIcon className="h-4 w-4" />
                Nueva propiedad
              </Button>
            )}
          </div>
        }
        empty={
          inTrash
            ? 'La papelera está vacía.'
            : hasFilters
              ? 'No hay propiedades que coincidan con los filtros.'
              : 'Todavía no hay propiedades en la cartera.'
        }
      />
      {permissions.create && <PropertySheet navigation={navigation} />}
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
