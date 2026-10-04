import type { HistoryValue } from '@norde/core/audit/contracts';

import { EMPTY_VALUE, formatAmount, formatMoney } from '../../lib/format';
import {
  CONDITION_LABELS,
  DISPOSITION_LABELS,
  HISTORY_FIELD_LABELS,
  ORIENTATION_LABELS,
} from './detail-labels';
import { MEDIA_KIND_LABELS } from '../media/labels';
import {
  OPERATION_LABELS,
  PROPERTY_STATUS_DISPLAY,
  PROPERTY_TYPE_LABELS,
  RESERVATION_STATUS_DISPLAY,
} from './labels';

// El historial guarda valores crudos (centavos, IDs, enums): acá se pasan a texto para mostrarlos.

type HistoryRecord = Readonly<Record<string, HistoryValue>>;

const STATUS_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PROPERTY_STATUS_DISPLAY).map(([status, display]) => [status, display.label]),
);

const OPERATION_NAMES: Readonly<Record<string, string>> = OPERATION_LABELS;

const RESERVATION_STATUS_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(RESERVATION_STATUS_DISPLAY).map(([status, display]) => [status, display.label]),
);

/** Montos de la reserva: la moneda va en su propio campo, así que se muestra solo el número. */
const AMOUNT_WITHOUT_CURRENCY = new Set(['amountCents', 'commissionCents']);

/** Valores de un catálogo según el campo: lo que no está en el catálogo se muestra tal cual. */
const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: STATUS_LABELS,
  propertyType: PROPERTY_TYPE_LABELS,
  orientation: ORIENTATION_LABELS,
  condition: CONDITION_LABELS,
  disposition: DISPOSITION_LABELS,
  kind: MEDIA_KIND_LABELS,
  reservationStatus: RESERVATION_STATUS_LABELS,
  reservationOperation: OPERATION_NAMES,
};

/** El último tramo de un campo de una fila hija (`media.<id>.showOnWeb` → `showOnWeb`). */
function baseField(field: string): string {
  return field.split('.').at(-1) ?? field;
}

export function historyFieldLabel(field: string): string {
  const base = baseField(field);
  const label = HISTORY_FIELD_LABELS[base] ?? base;
  if (field.startsWith('media.')) return `Foto: ${label.toLowerCase()}`;
  if (field.startsWith('attachments.')) return `Archivo: ${label.toLowerCase()}`;
  return label;
}

// `Array.isArray` no angosta las listas `readonly`.
function isList(value: HistoryValue): value is readonly HistoryValue[] {
  return Array.isArray(value);
}

function isRecord(value: HistoryValue): value is HistoryRecord {
  return typeof value === 'object' && value !== null && !isList(value);
}

/** "Venta US$ 120.000 (a consultar, 3 %)". */
function operation(value: HistoryRecord): string {
  const kind = value.operation;
  const name = typeof kind === 'string' ? (OPERATION_NAMES[kind] ?? kind) : '';
  const cents = value.priceCents;
  const currency = value.currency;
  const price =
    typeof cents === 'bigint' && (currency === 'ARS' || currency === 'USD')
      ? formatMoney({ amountCents: cents, currency })
      : 'sin precio';
  const extras = [
    value.priceOnRequest === true ? 'a consultar' : undefined,
    typeof value.commissionPct === 'number'
      ? `${value.commissionPct.toLocaleString('es-AR')} %`
      : undefined,
  ].filter((part) => part !== undefined);
  return `${name} ${price}${extras.length > 0 ? ` (${extras.join(', ')})` : ''}`.trim();
}

export function formatHistoryValue(field: string, value: HistoryValue): string {
  if (value === null) return EMPTY_VALUE;
  const base = baseField(field);
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'bigint') {
    if (AMOUNT_WITHOUT_CURRENCY.has(base)) return formatAmount(value);
    return base.endsWith('Cents')
      ? formatMoney({ amountCents: value, currency: 'ARS' })
      : value.toString();
  }
  if (typeof value === 'number') {
    if (base === 'rotation') return `${value.toString()}°`;
    if (base.endsWith('M2')) return `${value.toLocaleString('es-AR')} m²`;
    return value.toLocaleString('es-AR');
  }
  if (typeof value === 'string') return VALUE_LABELS[base]?.[value] ?? value;
  if (isList(value)) {
    if (value.length === 0) return 'Ninguno';
    if (base === 'operations') {
      return value
        .map((item) => (isRecord(item) ? operation(item) : formatHistoryValue('', item)))
        .join(' · ');
    }
    return `${value.length.toString()} ${value.length === 1 ? 'elemento' : 'elementos'}`;
  }
  const entries = Object.keys(value);
  return entries.length === 0
    ? 'Ninguno'
    : `${entries.length.toString()} ${entries.length === 1 ? 'valor' : 'valores'}`;
}
