'use client';

import type { HistoryEntryRow } from '@norde/core/audit/contracts';
import {
  PROPERTY_HISTORY_CATEGORY_VALUES,
  type PropertyHistoryCategory,
} from '@norde/core/properties/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { useId } from 'react';

import { formatDateTime } from '../../../../lib/format';
import { ServerDataTable, useListNavigation } from '../../../shared/components/server-data-table';
import { HISTORY_ACTION_LABELS, HISTORY_CATEGORY_LABELS } from '../../detail-labels';
import { formatHistoryValue, historyFieldLabel } from '../../history-format';

const ALL = '__all__';

function actorName(entry: HistoryEntryRow): string {
  if (entry.actor.id.startsWith('system:')) {
    return entry.source === 'agent' ? 'El agente de IA' : 'El sistema';
  }
  return entry.actor.name ?? 'Un usuario inactivo';
}

/** Lo que cambió, campo por campo: "Precio: US$ 120.000 → US$ 115.000". */
function Changes({ entry }: { readonly entry: HistoryEntryRow }) {
  const changes = Object.entries(entry.changes);
  if (changes.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
      {changes.map(([field, change]) => (
        <li key={field} className="break-words">
          <span className="font-medium text-foreground">{historyFieldLabel(field)}:</span>{' '}
          {change.before === null ? (
            formatHistoryValue(field, change.after)
          ) : (
            <>
              {formatHistoryValue(field, change.before)} → {formatHistoryValue(field, change.after)}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function Filters({
  category,
  from,
  to,
}: {
  readonly category: PropertyHistoryCategory | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-category`} className="text-xs">
          Tipo de cambio
        </Label>
        <Select
          value={category ?? ALL}
          onValueChange={(value) => {
            setParams({ category: value === ALL ? undefined : value });
          }}
        >
          <SelectTrigger id={`${id}-category`} size="sm" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            {PROPERTY_HISTORY_CATEGORY_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {HISTORY_CATEGORY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-from`} className="text-xs">
          Desde
        </Label>
        <Input
          id={`${id}-from`}
          type="date"
          className="h-8 w-40"
          defaultValue={from ?? ''}
          onChange={(event) => {
            setParams({ from: event.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-to`} className="text-xs">
          Hasta
        </Label>
        <Input
          id={`${id}-to`}
          type="date"
          className="h-8 w-40"
          defaultValue={to ?? ''}
          onChange={(event) => {
            setParams({ to: event.target.value });
          }}
        />
      </div>
    </div>
  );
}

/** La pestaña Historial: quién cambió qué y cuándo, paginada en el servidor. */
export function HistoryGrid({
  page,
  category,
  from,
  to,
}: {
  readonly page: Page<HistoryEntryRow>;
  readonly category: PropertyHistoryCategory | undefined;
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
            {HISTORY_ACTION_LABELS[entry.action] ?? entry.action}
          </p>
          <Changes entry={entry} />
        </div>
      ),
    },
  ];

  return (
    <ServerDataTable
      label="Historial de la propiedad"
      columns={columns}
      getRowId={(entry) => entry.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      toolbar={<Filters category={category} from={from} to={to} />}
      empty="No hay cambios con estos filtros."
    />
  );
}
