import type { FollowUpFrequencyValue } from '@norde/core/clients/contracts';

/** Cada cuánto le llega el resumen de una búsqueda al contacto (#208). */
export const FOLLOW_UP_FREQUENCY_LABELS: Readonly<Record<FollowUpFrequencyValue, string>> = {
  daily: 'Todos los días',
  every_3_days: 'Cada 3 días',
  weekly: 'Una vez por semana',
  monthly: 'Una vez por mes',
};
