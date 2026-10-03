import type { HistoryValue } from '@norde/core/audit/contracts';

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
};

export function developmentFieldLabel(field: string): string {
  return DEVELOPMENT_HISTORY_FIELD_LABELS[field] ?? historyFieldLabel(field);
}

export function formatDevelopmentValue(field: string, value: HistoryValue): string {
  if (typeof value === 'string') {
    if (field === 'deliveryDate') return formatDateOnly(value);
    const label = VALUE_LABELS[field]?.[value];
    if (label !== undefined) return label;
  }
  return formatHistoryValue(field, value);
}
