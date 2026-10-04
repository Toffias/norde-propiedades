'use client';

import type { ReservationRow } from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { StatusPill } from '@norde/ui/components/status-pill';
import type { Route } from 'next';
import Link from 'next/link';

import { EMPTY_VALUE, formatDate, formatDateOnly } from '../../../../lib/format';
import { ServerDataTable } from '../../../shared/components/server-data-table';
import { OPERATION_LABELS, RESERVATION_STATUS_DISPLAY } from '../../labels';
import { reservationAmount, reservationClient, reservationCommission } from './reservation-format';

/** La pestaña Reservas de la ficha: las activas, caídas y firmadas de la propiedad. */
export function ReservationsGrid({
  page,
  sort,
}: {
  readonly page: Page<ReservationRow>;
  readonly sort: { readonly field: string; readonly direction: 'asc' | 'desc' };
}) {
  const columns: readonly DataTableColumn<ReservationRow>[] = [
    {
      id: 'client',
      header: 'Contacto',
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
      showFrom: 'md',
      cell: (row) => row.agent?.name ?? EMPTY_VALUE,
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
      showFrom: 'lg',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => reservationCommission(row),
    },
    {
      id: 'reservedAt',
      header: 'Reservada',
      sortable: true,
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => formatDate(row.reservedAt),
    },
    {
      id: 'estimatedSigningDate',
      header: 'Firma estimada',
      sortable: true,
      showFrom: 'sm',
      className: 'whitespace-nowrap tabular-nums',
      cell: (row) => formatDateOnly(row.estimatedSigningDate),
    },
  ];

  return (
    <ServerDataTable
      label="Reservas de la propiedad"
      columns={columns}
      getRowId={(row) => row.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      sort={sort}
      empty="La propiedad no tiene reservas."
    />
  );
}
