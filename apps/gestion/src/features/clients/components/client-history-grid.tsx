'use client';

import type { HistoryEntryRow } from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { useId } from 'react';

import { formatDateTime } from '../../../lib/format';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import {
  CLIENT_HISTORY_ACTION_LABELS,
  clientHistoryFieldLabel,
  formatClientHistoryValue,
} from '../history-format';

function actorName(entry: HistoryEntryRow): string {
  if (entry.actor.id.startsWith('system:')) {
    return entry.source === 'agent' ? 'El agente de IA' : 'El sistema';
  }
  return entry.actor.name ?? 'Un usuario inactivo';
}

/** Lo que cambió, campo por campo: "Nombre: Ana → Ana Pérez". */
function Changes({ entry }: { readonly entry: HistoryEntryRow }) {
  const changes = Object.entries(entry.changes);
  if (changes.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {changes.map(([field, change]) => (
        <li key={field} className="break-words">
          <span className="font-medium text-foreground">{clientHistoryFieldLabel(field)}:</span>{' '}
          {change.before === null ? (
            formatClientHistoryValue(field, change.after)
          ) : (
            <>
              {formatClientHistoryValue(field, change.before)} →{' '}
              {formatClientHistoryValue(field, change.after)}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Filters({
  from,
  to,
}: {
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      {[
        { param: 'from', text: 'Desde', value: from },
        { param: 'to', text: 'Hasta', value: to },
      ].map((edge) => (
        <div key={edge.param} className="flex flex-col gap-1">
          <Label htmlFor={`${id}-${edge.param}`} className="text-xs">
            {edge.text}
          </Label>
          <Input
            id={`${id}-${edge.param}`}
            type="date"
            className="h-8 w-40"
            defaultValue={edge.value ?? ''}
            onChange={(event) => {
              setParams({ [edge.param]: event.target.value });
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** La pestaña Historial del contacto: quién cambió qué y cuándo, paginada en el servidor. */
export function ClientHistoryGrid({
  page,
  from,
  to,
}: {
  readonly page: Page<HistoryEntryRow>;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  const columns: readonly DataTableColumn<HistoryEntryRow>[] = [
    {
      id: 'occurredAt',
      header: 'Fecha',
      className: 'w-40 align-top whitespace-nowrap',
      cell: (entry) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDateTime(entry.occurredAt)}
        </span>
      ),
    },
    {
      id: 'change',
      header: 'Cambio',
      cell: (entry) => (
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-medium">{actorName(entry)}</span>{' '}
            {CLIENT_HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
          </p>
          <Changes entry={entry} />
        </div>
      ),
    },
  ];

  return (
    <ServerDataTable
      label="Historial del contacto"
      columns={columns}
      getRowId={(entry) => entry.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      toolbar={<Filters from={from} to={to} />}
      empty="No hay cambios con estos filtros."
    />
  );
}
