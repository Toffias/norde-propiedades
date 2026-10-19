import type { UrgencyValue } from '@norde/core/reporting/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Cómo se ve cada nivel de urgencia de Inicio. La regla (cuándo es ámbar o rojo) está en el
// dominio de reporting; acá solo se pinta.

export const URGENCY_TONES: Readonly<Record<UrgencyValue, StatusTone>> = {
  ok: 'green',
  warning: 'amber',
  overdue: 'red',
};

export const URGENCY_LABELS: Readonly<Record<UrgencyValue, string>> = {
  ok: 'Al día',
  warning: 'Pide atención',
  overdue: 'Atrasado',
};

/** La franja de color arriba de cada tarjeta de urgencia. */
export const URGENCY_BARS: Readonly<Record<UrgencyValue, string>> = {
  ok: 'bg-success-500',
  warning: 'bg-warning-500',
  overdue: 'bg-danger-500',
};

/** El círculo del ícono (y de las iniciales) teñido con el color de la urgencia. */
export const URGENCY_BUBBLES: Readonly<Record<UrgencyValue, string>> = {
  ok: 'bg-success-50 text-success-600 dark:bg-success-700/30 dark:text-success-300',
  warning: 'bg-warning-50 text-warning-700 dark:bg-warning-700/30 dark:text-warning-300',
  overdue: 'bg-danger-50 text-danger-700 dark:bg-danger-700/30 dark:text-danger-300',
};
