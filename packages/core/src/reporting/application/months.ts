// Meses y días en hora de Buenos Aires (UTC-3, sin horario de verano desde 2009).

const OFFSET_MS = 3 * 60 * 60 * 1000;

/** `AAAA-MM` del instante, en Buenos Aires. */
export function monthOf(instant: Date): string {
  return new Date(instant.getTime() - OFFSET_MS).toISOString().slice(0, 7);
}

/** Comienzo (UTC) del mes `AAAA-MM` de Buenos Aires. */
export function startOfMonth(month: string): Date {
  return new Date(`${month}-01T03:00:00.000Z`);
}

/** El mes `AAAA-MM` corrido `delta` meses. */
export function shiftMonth(month: string, delta: number): string {
  const [year = 0, value = 1] = month.split('-').map(Number);
  const index = year * 12 + (value - 1) + delta;
  const shiftedYear = Math.floor(index / 12).toString();
  const shiftedMonth = ((index % 12) + 1).toString().padStart(2, '0');
  return `${shiftedYear}-${shiftedMonth}`;
}

/** Los últimos `count` meses hasta el de `now`, del más viejo al actual. */
export function lastMonths(now: Date, count: number): readonly string[] {
  const current = monthOf(now);
  return Array.from({ length: count }, (_, index) => shiftMonth(current, index - count + 1));
}

/** Comienzo (UTC) del día `AAAA-MM-DD` de Buenos Aires. */
export function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/** Comienzo del día siguiente: el límite exclusivo de un rango que termina ese día. */
export function endOfDay(date: string): Date {
  return new Date(startOfDay(date).getTime() + 24 * 60 * 60 * 1000);
}
