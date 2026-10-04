import type { HistoryValue } from '@norde/core/audit/contracts';

import { formatAmount, formatDateTime, formatMoney } from '../../lib/format';
import { formatHistoryValue, historyFieldLabel } from '../properties/history-format';
import {
  APPRAISAL_HISTORY_FIELD_LABELS,
  APPRAISAL_SOURCE_LABELS,
  APPRAISAL_STATUS_DISPLAY,
} from './labels';

// El historial guarda valores crudos (enums, fechas ISO, IDs): acá se pasan a texto.

const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: Object.fromEntries(
    Object.entries(APPRAISAL_STATUS_DISPLAY).map(([status, display]) => [status, display.label]),
  ),
  source: APPRAISAL_SOURCE_LABELS,
};

// `Array.isArray` no angosta las listas `readonly`.
function isRecord(value: HistoryValue): value is Readonly<Record<string, HistoryValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Un comparable guardado: "Mitre 1500 (US$ 118.000)". */
function comparable(value: HistoryValue): string {
  if (!isRecord(value)) return formatHistoryValue('', value);
  const { address, priceCents, currency } = value;
  const price =
    typeof priceCents === 'bigint' && (currency === 'USD' || currency === 'ARS')
      ? ` (${formatMoney({ amountCents: priceCents, currency })})`
      : '';
  return `${typeof address === 'string' ? address : 'Sin dirección'}${price}`;
}

export function appraisalFieldLabel(field: string): string {
  if (field.startsWith('photos.')) return 'Foto';
  return APPRAISAL_HISTORY_FIELD_LABELS[field] ?? historyFieldLabel(field);
}

export function formatAppraisalValue(field: string, value: HistoryValue): string {
  if (field.startsWith('photos.')) return value === null ? 'Sin foto' : 'Cargada';
  // La moneda va en su propio campo: el monto se muestra solo.
  if (typeof value === 'bigint' && field.endsWith('Cents')) return formatAmount(value);
  if (field === 'comparables' && Array.isArray(value)) {
    return value.map(comparable).join(' · ');
  }
  if (typeof value === 'string') {
    if (field === 'visitAt') return formatDateTime(value);
    const label = VALUE_LABELS[field]?.[value];
    if (label !== undefined) return label;
  }
  return formatHistoryValue(field, value);
}
