/**
 * Qué tan urgente es atender algo en Inicio: al día, pide atención (ámbar) o atrasado (rojo).
 * Decisión de Norde (2026-10-19), en `docs/negocio/decisiones.md`.
 */
export const URGENCY_LEVELS = ['ok', 'warning', 'overdue'] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Una consulta sin asignar o una oportunidad sin contactar: ámbar al día, rojo a los tres días. */
export const WAITING_WARNING_MS = DAY_MS;
export const WAITING_OVERDUE_MS = 3 * DAY_MS;

export function waitingUrgency(since: Date, now: Date): Urgency {
  const waited = now.getTime() - since.getTime();
  if (waited >= WAITING_OVERDUE_MS) return 'overdue';
  if (waited >= WAITING_WARNING_MS) return 'warning';
  return 'ok';
}

/** Una reserva por firmar: roja si la fecha estimada ya pasó, ámbar si es en la semana. */
export const SIGNING_WARNING_DAYS = 7;

/** `today` y `signingDate` como `AAAA-MM-DD`. */
export function signingUrgency(signingDate: string, today: string): Urgency {
  if (signingDate < today) return 'overdue';
  const days = (Date.parse(`${signingDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  return days <= SIGNING_WARNING_DAYS ? 'warning' : 'ok';
}

/** Un aviso con problemas: rojo si falló, ámbar si está pausado (por el portal o a mano allá). */
export function portalAlertUrgency(status: 'paused' | 'error'): Urgency {
  return status === 'error' ? 'overdue' : 'warning';
}

/** La peor de varias: la franja de Inicio se pinta con la más urgente de su lista. */
export function worstUrgency(levels: readonly Urgency[]): Urgency {
  if (levels.includes('overdue')) return 'overdue';
  if (levels.includes('warning')) return 'warning';
  return 'ok';
}
