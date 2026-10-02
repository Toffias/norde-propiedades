'use client';

import type { Route } from 'next';
import Link from 'next/link';

import {
  CLIENT_KIND_LABELS,
  CLIENT_TYPE_LABELS,
  type ClientListRow,
} from '@norde/core/clients/contracts';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { RowAction, RowActions } from '@norde/ui/components/row-actions';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { ArchiveRestoreIcon, LockIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import type { ActionResult } from '../../../lib/action-result';
import { EMPTY_VALUE, formatDate, formatDateTime } from '../../../lib/format';
import {
  ConfirmActionDialog,
  type ConfirmActionCopy,
} from '../../shared/components/confirm-action-dialog';
import { ServerDataTable } from '../../shared/components/server-data-table';
import { deleteClientAction, restoreClientAction } from '../actions';
import { clientName, formatPhone, userName } from '../client-format';
import type { ClientFilterValues } from './clients-toolbar';

interface PendingAction {
  readonly copy: ConfirmActionCopy;
  readonly run: () => Promise<ActionResult>;
}

function getRowId(row: ClientListRow): string {
  return row.id;
}

function Masked({
  value,
  masked,
}: {
  readonly value: string | undefined;
  readonly masked: boolean;
}) {
  if (value === undefined) return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {masked && (
        <LockIcon className="h-3 w-3 text-muted-foreground" aria-label="Datos de propietario" />
      )}
      {masked ? value : formatPhone(value)}
    </span>
  );
}

/**
 * Grilla de contactos: Nombre, Empresa, Teléfono, Celular, Email, Agente, Creación y Última
 * actualización. En la papelera, quién borró y cuándo, con restaurar.
 */
export function ClientsGrid({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  canDelete,
  toolbar,
}: {
  readonly rows: readonly ClientListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
  readonly filters: ClientFilterValues;
  /** Borrar o restaurar: el caso de uso decide sobre cada contacto (propios o de otros). */
  readonly canDelete: boolean;
  readonly toolbar: ReactNode;
}) {
  const [pending, setPending] = useState<PendingAction | undefined>();
  const inTrash = filters.view === 'trash';
  const hasFilters = Object.entries(filters).some(
    ([key, value]) => key !== 'view' && value !== '' && value !== false,
  );

  const columns = useMemo(
    (): readonly DataTableColumn<ClientListRow>[] => [
      {
        id: 'name',
        header: 'Nombre',
        sortable: true,
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <Link
              // La ficha de la fila: typedRoutes no verifica un segmento dinámico armado.
              href={`/contactos/${row.id}` as Route}
              className="truncate font-medium text-primary-700 hover:underline dark:text-primary-400"
            >
              {clientName(row.name)}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {row.kind === 'person' ? '' : `${CLIENT_KIND_LABELS[row.kind]} · `}
              {row.clientTypes.map((type) => CLIENT_TYPE_LABELS[type]).join(', ')}
            </span>
          </div>
        ),
      },
      {
        id: 'company',
        header: 'Empresa',
        showFrom: 'xl',
        className: 'text-muted-foreground',
        cell: (row) => row.companyName ?? EMPTY_VALUE,
      },
      {
        id: 'phone',
        header: 'Teléfono',
        showFrom: 'lg',
        className: 'tabular-nums text-muted-foreground',
        cell: (row) => <Masked value={row.phone} masked={row.contactMasked} />,
      },
      {
        id: 'mobile',
        header: 'Celular',
        className: 'tabular-nums',
        cell: (row) => <Masked value={row.mobile} masked={row.contactMasked} />,
      },
      {
        id: 'email',
        header: 'Email',
        showFrom: 'md',
        className: 'max-w-[240px] truncate text-muted-foreground',
        cell: (row) => row.email ?? EMPTY_VALUE,
      },
      {
        id: 'agent',
        header: 'Agente',
        showFrom: 'lg',
        className: 'whitespace-nowrap',
        cell: (row) =>
          row.agent === undefined ? <SoftBadge>Sin agente</SoftBadge> : userName(row.agent),
      },
      ...(inTrash
        ? [
            {
              id: 'deletedAt',
              header: 'Borrado',
              className: 'w-[200px] text-muted-foreground',
              cell: (row: ClientListRow) => (
                <div className="flex flex-col">
                  <span className="tabular-nums">{formatDateTime(row.deletedAt)}</span>
                  <span className="text-xs">por {userName(row.deletedBy)}</span>
                </div>
              ),
            },
          ]
        : [
            {
              id: 'createdAt',
              header: 'Creación',
              sortable: true,
              showFrom: 'xl' as const,
              className: 'w-[110px] tabular-nums text-muted-foreground',
              cell: (row: ClientListRow) => formatDate(row.createdAt),
            },
            {
              id: 'updatedAt',
              header: 'Últ. actualización',
              sortable: true,
              showFrom: 'md' as const,
              className: 'w-[130px] tabular-nums text-muted-foreground',
              cell: (row: ClientListRow) => formatDate(row.updatedAt),
            },
          ]),
      {
        id: 'actions',
        header: 'Acciones',
        hideHeader: true,
        className: 'w-[60px] text-right',
        cell: (row) =>
          canDelete && (
            <RowActions>
              {inTrash ? (
                <RowAction
                  icon={ArchiveRestoreIcon}
                  label="Restaurar"
                  onClick={() => {
                    setPending({
                      copy: {
                        title: 'Restaurar contacto',
                        description: `${clientName(row.name)} vuelve a la agenda.`,
                        confirm: 'Restaurar',
                        done: 'Contacto restaurado',
                      },
                      run: () => restoreClientAction({ clientId: row.id }),
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
                        title: 'Borrar contacto',
                        description: `${clientName(row.name)} va a la papelera; desde ahí lo podés restaurar.`,
                        confirm: 'Borrar',
                        done: 'Contacto enviado a la papelera',
                        destructive: true,
                      },
                      run: () => deleteClientAction({ clientId: row.id }),
                    });
                  }}
                />
              )}
            </RowActions>
          ),
      },
    ],
    [inTrash, canDelete],
  );

  return (
    <>
      <ServerDataTable
        label={inTrash ? 'Papelera de contactos' : 'Contactos'}
        columns={columns}
        rows={rows}
        total={total}
        page={page}
        pageSize={pageSize}
        sort={sort}
        getRowId={getRowId}
        toolbar={toolbar}
        empty={
          inTrash
            ? 'La papelera está vacía.'
            : hasFilters
              ? 'No hay contactos que coincidan con los filtros.'
              : 'Todavía no hay contactos. Los que lleguen por WhatsApp, la web o los portales aparecen acá.'
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
