import type { HistoryValue } from '@norde/core/audit/contracts';

import { formatDateTime } from '../../lib/format';
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

export function appraisalFieldLabel(field: string): string {
  return APPRAISAL_HISTORY_FIELD_LABELS[field] ?? historyFieldLabel(field);
}

export function formatAppraisalValue(field: string, value: HistoryValue): string {
  if (typeof value === 'string') {
    if (field === 'visitAt') return formatDateTime(value);
    const label = VALUE_LABELS[field]?.[value];
    if (label !== undefined) return label;
  }
  return formatHistoryValue(field, value);
}
