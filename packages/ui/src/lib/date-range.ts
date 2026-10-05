/**
 * Un rango de fechas como lo guardan los filtros: `AAAA-MM-DD` (el valor de un `<input type="date">`),
 * con `''` para "sin límite". Las fechas son del calendario local, sin hora.
 */
export interface IsoDateRange {
  readonly from: string;
  readonly to: string;
}

export const EMPTY_DATE_RANGE: IsoDateRange = { from: '', to: '' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `AAAA-MM-DD` → fecha local a las 00:00; `undefined` si está vacía o no es válida. */
export function parseIsoDate(value: string): Date | undefined {
  const match = ISO_DATE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // `new Date` corre los días fuera de rango (31 de febrero → 3 de marzo): eso no es una fecha válida.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

/** Fecha local → `AAAA-MM-DD`. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const PARTS = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

/** "5 oct 2026" (o "5 oct" sin el año): `es-AR` diría "5 de oct de 2026". */
function shortDate(date: Date, withYear: boolean): string {
  const parts = PARTS.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value.replace('.', '') ?? '';
  return [part('day'), part('month'), withYear ? part('year') : ''].filter(Boolean).join(' ');
}

/**
 * El texto del botón: "3 – 15 oct 2026", "28 sep – 5 oct 2026", "Desde 3 oct 2026" o `undefined`
 * sin fechas. El año va una sola vez si las dos fechas son del mismo año.
 */
export function formatDateRange(range: IsoDateRange): string | undefined {
  const from = parseIsoDate(range.from);
  const to = parseIsoDate(range.to);
  if (from && to) {
    if (toIsoDate(from) === toIsoDate(to)) return shortDate(from, true);
    const sameYear = from.getFullYear() === to.getFullYear();
    return `${shortDate(from, !sameYear)} – ${shortDate(to, true)}`;
  }
  if (from) return `Desde ${shortDate(from, true)}`;
  if (to) return `Hasta ${shortDate(to, true)}`;
  return undefined;
}

export interface DateRangePreset {
  readonly label: string;
  readonly range: IsoDateRange;
}

/** Atajos del calendario, relativos a `today` (el día local de quien mira). */
export function dateRangePresets(today: Date): readonly DateRangePreset[] {
  const day = (offset: number) =>
    toIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  const year = today.getFullYear();
  const month = today.getMonth();
  return [
    { label: 'Hoy', range: { from: day(0), to: day(0) } },
    { label: 'Últimos 7 días', range: { from: day(-6), to: day(0) } },
    { label: 'Últimos 30 días', range: { from: day(-29), to: day(0) } },
    {
      label: 'Este mes',
      range: { from: toIsoDate(new Date(year, month, 1)), to: day(0) },
    },
    {
      label: 'Mes pasado',
      range: {
        from: toIsoDate(new Date(year, month - 1, 1)),
        to: toIsoDate(new Date(year, month, 0)),
      },
    },
    { label: 'Este año', range: { from: toIsoDate(new Date(year, 0, 1)), to: day(0) } },
  ];
}
