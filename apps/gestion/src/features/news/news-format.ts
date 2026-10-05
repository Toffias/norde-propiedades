import type { HistoryValue, NewsEntryRow, NewsKindValue } from '@norde/core/audit/contracts';
import type { Currency } from '@norde/core/properties/contracts';

import { formatMoney } from '../../lib/format';
import { OPERATION_LABELS, PROPERTY_STATUS_DISPLAY } from '../properties/labels';

// Cada novedad del feed en una o más líneas ("El precio de venta subió a US$ 128.000"). El historial
// guarda valores crudos (centavos, enums, IDs): acá se pasan a texto.

export type NewsTrend = 'up' | 'down';

export interface NewsLine {
  readonly text: string;
  /** Si el precio subió o bajó, para el ícono. */
  readonly trend?: NewsTrend;
}

/** El texto corto de la etiqueta de cada novedad. */
const KIND_BADGES: Readonly<Record<NewsKindValue, string>> = {
  'client.created': 'Nuevo contacto',
  'client.reassigned': 'Contacto reasignado',
  'client.deleted': 'Contacto borrado',
  'property.created': 'Nueva propiedad',
  'property.status_changed': 'Cambio de estado',
  'property.operation_changed': 'Cambio de operación',
  'property.price_changed': 'Cambio de precio',
  'property.reservation': 'Reserva',
};

const RESERVATION_TEXTS: Readonly<Record<string, string>> = {
  'property.reserved': 'Se reservó la propiedad',
  'property.reservation_fallen': 'Se cayó la reserva',
  'property.reservation_signed': 'Se firmó la reserva',
};

const OPERATION_NAMES: Readonly<Record<string, string>> = OPERATION_LABELS;

const STATUS_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PROPERTY_STATUS_DISPLAY).map(([status, display]) => [status, display.label]),
);

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const LONG_DAY = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const LONG_DAY_WITH_YEAR = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** El día de Buenos Aires de un instante, como lo agrupa el feed (`AAAA-MM-DD`). */
export function newsDayOf(at: Date): string {
  return DAY_KEY.format(at);
}

/** "Hoy", "Ayer" o "viernes, 2 de octubre" (con el año si no es el actual). */
export function newsDayLabel(day: string, today: string): string {
  if (day === today) return 'Hoy';
  const date = new Date(`${day}T12:00:00Z`);
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date.getTime() === yesterday.getTime()) return 'Ayer';
  const label = (day.slice(0, 4) === today.slice(0, 4) ? LONG_DAY : LONG_DAY_WITH_YEAR).format(
    date,
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function newsBadge(kind: NewsKindValue): string {
  return KIND_BADGES[kind];
}

/** Quién hizo el cambio: un usuario, el agente de IA o un proceso del sistema. */
export function newsAuthor(entry: NewsEntryRow): string {
  if (entry.actor.id === 'system:agent-ia') return 'El agente de IA';
  if (entry.actor.id.startsWith('system:')) return 'El sistema';
  return entry.actor.name ?? 'Un usuario inactivo';
}

interface OperationPrice {
  readonly operation: string;
  readonly currency: Currency | undefined;
  readonly priceCents: bigint | undefined;
}

// `Array.isArray` no angosta las listas `readonly`.
function isList(value: HistoryValue | undefined): value is readonly HistoryValue[] {
  return Array.isArray(value);
}

function isRecord(value: HistoryValue): value is Readonly<Record<string, HistoryValue>> {
  return typeof value === 'object' && value !== null && !isList(value);
}

function operationsOf(value: HistoryValue | undefined): readonly OperationPrice[] {
  if (!isList(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const { operation, currency, priceCents } = item;
    if (typeof operation !== 'string') return [];
    return [
      {
        operation,
        currency: currency === 'ARS' || currency === 'USD' ? currency : undefined,
        priceCents: typeof priceCents === 'bigint' ? priceCents : undefined,
      },
    ];
  });
}

function price(operation: OperationPrice): string | undefined {
  if (operation.priceCents === undefined || operation.currency === undefined) return undefined;
  return formatMoney({ amountCents: operation.priceCents, currency: operation.currency });
}

function operationName(operation: string): string {
  return (OPERATION_NAMES[operation] ?? operation).toLowerCase();
}

/** "venta y alquiler". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1) ?? ''}`;
}

/** Una línea por cada operación cuyo precio cambió. */
function priceLines(entry: NewsEntryRow): NewsLine[] {
  const change = entry.changes.operations;
  const before = operationsOf(change?.before);
  return operationsOf(change?.after).flatMap((after): NewsLine[] => {
    const previous = before.find((o) => o.operation === after.operation);
    if (
      previous === undefined ||
      (previous.priceCents === after.priceCents && previous.currency === after.currency)
    ) {
      return [];
    }
    const name = operationName(after.operation);
    const now = price(after);
    const then = price(previous);
    if (now === undefined)
      return [{ text: `Se quitó el precio de ${name} (antes ${then ?? '—'})` }];
    if (then === undefined) return [{ text: `Se cargó el precio de ${name}: ${now}` }];
    if (previous.currency !== after.currency || previous.priceCents === undefined) {
      return [{ text: `El precio de ${name} pasó a ${now} (antes ${then})` }];
    }
    const up = (after.priceCents ?? 0n) > previous.priceCents;
    return [
      {
        text: `El precio de ${name} ${up ? 'subió' : 'bajó'} a ${now} (antes ${then})`,
        trend: up ? 'up' : 'down',
      },
    ];
  });
}

function operationLine(entry: NewsEntryRow): NewsLine {
  const change = entry.changes.operations;
  const names = (value: HistoryValue | undefined) =>
    joinNames([...new Set(operationsOf(value).map((o) => operationName(o.operation)))]);
  return {
    text: `Ahora se ofrece en ${names(change?.after)} (antes: ${names(change?.before)})`,
  };
}

function statusName(value: HistoryValue | undefined): string {
  return typeof value === 'string' ? (STATUS_NAMES[value] ?? value) : '—';
}

/** Lo que pasó, en una o más líneas. */
export function newsLines(entry: NewsEntryRow): readonly NewsLine[] {
  switch (entry.kind) {
    case 'property.price_changed': {
      const lines = priceLines(entry);
      return lines.length > 0 ? lines : [{ text: 'Cambió el precio' }];
    }
    case 'property.operation_changed':
      return [operationLine(entry)];
    case 'property.status_changed': {
      const status = entry.changes.status;
      return [{ text: `Pasó de ${statusName(status?.before)} a ${statusName(status?.after)}` }];
    }
    case 'property.created':
      return [{ text: 'Se cargó la propiedad' }];
    case 'property.reservation':
      return [{ text: RESERVATION_TEXTS[entry.action] ?? 'Cambió la reserva' }];
    case 'client.created':
      return [
        {
          text:
            entry.action === 'client.registered'
              ? 'Se registró el contacto'
              : 'Se cargó el contacto',
        },
      ];
    case 'client.reassigned':
      return [
        {
          text: entry.assignee
            ? `Se reasignó a ${entry.assignee.name ?? 'un usuario inactivo'}`
            : 'Se quitó el agente',
        },
      ];
    case 'client.deleted':
      return [{ text: 'Se borró el contacto' }];
  }
}
