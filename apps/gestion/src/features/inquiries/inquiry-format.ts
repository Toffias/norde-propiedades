import {
  CONTACT_CHANNEL_LABELS,
  type InquiryTabValue,
  type InquiryTag,
} from '@norde/core/clients/contracts';

import { OPERATION_LABELS, PROPERTY_TYPE_LABELS } from '../properties/labels';

// Cómo se muestran en el panel las consultas de la bandeja.

export const INQUIRY_TAB_LABELS: Readonly<Record<InquiryTabValue, string>> = {
  pending: 'Pendientes',
  assigned: 'Asignadas',
  deleted: 'Borradas',
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Cuánto hace que entró: "recién", "hace 5 min", "hace 3 h", "hace 2 días". */
export function formatAge(receivedAt: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - receivedAt.getTime());
  if (elapsed < MINUTE_MS) return 'recién';
  if (elapsed < HOUR_MS) return `hace ${String(Math.floor(elapsed / MINUTE_MS))} min`;
  if (elapsed < DAY_MS) return `hace ${String(Math.floor(elapsed / HOUR_MS))} h`;
  const days = Math.floor(elapsed / DAY_MS);
  return days === 1 ? 'hace 1 día' : `hace ${String(days)} días`;
}

const LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  channel: CONTACT_CHANNEL_LABELS,
  operation: OPERATION_LABELS,
  type: PROPERTY_TYPE_LABELS,
};

/** La etiqueta automática en palabras; el barrio va tal cual. */
export function tagLabel(tag: InquiryTag): string {
  return LABELS[tag.kind]?.[tag.value] ?? tag.value;
}
