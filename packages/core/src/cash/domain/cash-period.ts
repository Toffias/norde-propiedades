// La caja se lleva por mes calendario de Buenos Aires (`AAAA-MM`). Las fechas de los movimientos
// son días de Buenos Aires (`AAAA-MM-DD`), sin hora.

/** Mes de la caja, `AAAA-MM`. */
export type CashPeriod = string;

/** Buenos Aires está en UTC−3 todo el año (sin horario de verano desde 2009). */
const BUENOS_AIRES_OFFSET_MS = 3 * 60 * 60 * 1000;

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCashPeriod(value: string): boolean {
  return PERIOD.test(value);
}

/** `AAAA-MM-DD` que existe en el calendario (no `2026-02-30`). */
export function isCashDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/** El día de Buenos Aires en ese instante: `AAAA-MM-DD`. */
export function buenosAiresDate(instant: Date): string {
  return new Date(instant.getTime() - BUENOS_AIRES_OFFSET_MS).toISOString().slice(0, 10);
}

/** El mes vigente de la caja en ese instante. */
export function currentCashPeriod(instant: Date): CashPeriod {
  return buenosAiresDate(instant).slice(0, 7);
}

/** El mes de un día: `2026-10-23` → `2026-10`. */
export function periodOf(date: string): CashPeriod {
  return date.slice(0, 7);
}

export function nextCashPeriod(period: CashPeriod): CashPeriod {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Un mes anterior al vigente está cerrado, tenga o no su cierre guardado. */
export function isClosedCashPeriod(period: CashPeriod, current: CashPeriod): boolean {
  return period < current;
}
