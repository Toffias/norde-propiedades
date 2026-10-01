'use client';

import type { InterestedClientRow, PropertySendRow } from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';

import { EMPTY_VALUE, formatDate, formatDateTime } from '../../../../lib/format';
import { ServerDataTable } from '../../../shared/components/server-data-table';
import { REACTION_LABELS, SEND_CHANNEL_LABELS } from '../../detail-labels';
import { OPERATION_LABELS } from '../../labels';

type View = 'interesados' | 'envios';

const OPERATION_NAMES: Readonly<Record<string, string>> = OPERATION_LABELS;

/** Interesados o envíos: dos listados de la misma pestaña, cada uno con su paginación. */
function ViewSwitch({
  propertyId,
  active,
}: {
  readonly propertyId: string;
  readonly active: View;
}) {
  const views: readonly { readonly view: View; readonly label: string }[] = [
    { view: 'interesados', label: 'Potenciales interesados' },
    { view: 'envios', label: 'Envíos de la ficha' },
  ];
  return (
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
      {views.map(({ view, label }) => (
        <Link
          key={view}
          href={
            `/propiedades/${propertyId}?tab=contactos${view === 'envios' ? '&vista=envios' : ''}` as Route
          }
          scroll={false}
          aria-current={view === active ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium text-muted-foreground hover:text-foreground',
            view === active && 'bg-background text-foreground shadow-sm dark:bg-card',
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

/** Clientes con búsquedas guardadas que coinciden con la propiedad. */
export function InterestedGrid({
  propertyId,
  page,
}: {
  readonly propertyId: string;
  readonly page: Page<InterestedClientRow>;
}) {
  const columns: readonly DataTableColumn<InterestedClientRow>[] = [
    {
      id: 'client',
      header: 'Cliente',
      cell: (row) => <span className="font-medium">{row.clientName ?? 'Sin nombre'}</span>,
    },
    {
      id: 'search',
      header: 'Búsqueda',
      showFrom: 'md',
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.savedSearchName ?? 'Búsqueda sin nombre'} ·{' '}
          {OPERATION_NAMES[row.operation] ?? row.operation}
        </span>
      ),
    },
    {
      id: 'agent',
      header: 'Agente',
      showFrom: 'lg',
      cell: (row) => row.agent?.name ?? EMPTY_VALUE,
    },
    {
      id: 'updatedAt',
      header: 'Actualizada',
      showFrom: 'sm',
      cell: (row) => <span className="text-muted-foreground">{formatDate(row.updatedAt)}</span>,
    },
  ];
  return (
    <ServerDataTable
      label="Potenciales interesados"
      columns={columns}
      getRowId={(row) => row.savedSearchId}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      toolbar={<ViewSwitch propertyId={propertyId} active="interesados" />}
      empty="Ningún cliente tiene una búsqueda guardada que coincida con esta propiedad."
    />
  );
}

/** Historial de envíos de la ficha y lo que hizo cada cliente con el link. */
export function SendsGrid({
  propertyId,
  page,
}: {
  readonly propertyId: string;
  readonly page: Page<PropertySendRow>;
}) {
  const columns: readonly DataTableColumn<PropertySendRow>[] = [
    {
      id: 'client',
      header: 'Cliente',
      cell: (row) => <span className="font-medium">{row.clientName ?? 'Sin nombre'}</span>,
    },
    {
      id: 'channel',
      header: 'Canal',
      showFrom: 'sm',
      cell: (row) => SEND_CHANNEL_LABELS[row.channel] ?? row.channel,
    },
    {
      id: 'sentAt',
      header: 'Enviada',
      showFrom: 'md',
      cell: (row) => (
        <span className="text-muted-foreground">
          {formatDateTime(row.sentAt)}
          {row.sentBy.name === undefined ? '' : ` · ${row.sentBy.name}`}
        </span>
      ),
    },
    {
      id: 'reaction',
      header: 'Respuesta',
      cell: (row) =>
        row.reaction !== undefined ? (
          <StatusPill tone={row.reaction === 'liked' ? 'green' : 'red'}>
            {REACTION_LABELS[row.reaction]}
          </StatusPill>
        ) : row.openCount > 0 ? (
          <StatusPill tone="amber">
            Abrió {row.openCount === 1 ? '1 vez' : `${row.openCount.toString()} veces`}
          </StatusPill>
        ) : (
          <StatusPill tone="gray">Sin abrir</StatusPill>
        ),
    },
  ];
  return (
    <ServerDataTable
      label="Envíos de la ficha"
      columns={columns}
      getRowId={(row) => `${row.sharedListingId}-${row.clientId}`}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      toolbar={<ViewSwitch propertyId={propertyId} active="envios" />}
      empty="Todavía no se envió esta propiedad a ningún cliente."
    />
  );
}
