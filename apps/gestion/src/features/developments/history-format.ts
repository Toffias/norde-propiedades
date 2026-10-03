import type { HistoryValue } from '@norde/core/audit/contracts';
import { UNIT_IMPORT_FAILURE_LABELS } from '@norde/core/properties/contracts';

import { formatDateOnly } from '../../lib/format';
import { formatHistoryValue, historyFieldLabel } from '../properties/history-format';
import {
  CONSTRUCTION_STATUS_LABELS,
  DEVELOPMENT_HISTORY_FIELD_LABELS,
  DEVELOPMENT_STATUS_DISPLAY,
  DEVELOPMENT_TYPE_LABELS,
} from './labels';

// El historial guarda valores crudos (enums, fechas ISO, IDs): acá se pasan a texto.

const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: Object.fromEntries(
    Object.entries(DEVELOPMENT_STATUS_DISPLAY).map(([status, display]) => [status, display.label]),
  ),
  developmentType: DEVELOPMENT_TYPE_LABELS,
  constructionStatus: CONSTRUCTION_STATUS_LABELS,
  failure: UNIT_IMPORT_FAILURE_LABELS,
};

export function developmentFieldLabel(field: string): string {
  return DEVELOPMENT_HISTORY_FIELD_LABELS[field] ?? historyFieldLabel(field);
}

// `Array.isArray` no angosta las listas `readonly`.
function isList(value: HistoryValue): value is readonly HistoryValue[] {
  return Array.isArray(value);
}

function weightOf(item: HistoryValue): number | undefined {
  if (typeof item !== 'object' || item === null || isList(item)) return undefined;
  return typeof item.weight === 'number' ? item.weight : undefined;
}

/** "2 agentes (pesos 2 y 1)": el historial guarda los usuarios por ID. */
function chances(value: HistoryValue): string | undefined {
  if (!isList(value)) return undefined;
  const weights = value.flatMap((item) => {
    const weight = weightOf(item);
    return weight === undefined ? [] : [weight.toLocaleString('es-AR')];
  });
  const [only] = weights;
  if (only === undefined) return 'Sin derivación';
  if (weights.length === 1) return `1 agente (peso ${only})`;
  const list = `${weights.slice(0, -1).join(', ')} y ${weights.at(-1) ?? ''}`;
  return `${String(weights.length)} agentes (pesos ${list})`;
}

export function formatDevelopmentValue(field: string, value: HistoryValue): string {
  if (field === 'chances') {
    const text = chances(value);
    if (text !== undefined) return text;
  }
  if (typeof value === 'string') {
    if (field === 'deliveryDate') return formatDateOnly(value);
    const label = VALUE_LABELS[field]?.[value];
    if (label !== undefined) return label;
  }
  return formatHistoryValue(field, value);
}
