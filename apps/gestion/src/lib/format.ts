import type { Currency, MoneyDto } from '@norde/core/properties/contracts';

// Formato de datos para mostrar. Las fechas se guardan en UTC y se muestran en Buenos Aires.

const DISPLAY_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Valor vacío o inválido en una celda. */
export const EMPTY_VALUE = '—';

const moneyFormatters: Record<Currency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }),
};

const CURRENCY_SYMBOL: Record<Currency, string> = { ARS: '$', USD: 'US$' };

/** Centavos como decimal exacto ("-1234.05"): Intl lo redondea sin pasar por `number`. */
function centsToDecimal(cents: bigint): `${number}` {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${(abs / 100n).toString()}.${fraction}` as `${number}`; // Intl acepta decimales como string.
}

/** "$ 420.000", "US$ 1.500", "-$ 1.000". Sin decimales. */
export function formatMoney(money: MoneyDto | null): string {
  if (!money) return EMPTY_VALUE;
  return moneyFormatters[money.currency].format(centsToDecimal(money.amountCents));
}

const oneDecimal = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/**
 * Monto compacto para ejes de gráficos: "$ 1,3 M", "$ 45 mil", "$ 900". Recibe unidades enteras
 * (pesos o dólares), no centavos: es solo para mostrar.
 */
export function formatMoneyCompact(units: number, currency: Currency = 'ARS'): string {
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(units);
  const symbol = CURRENCY_SYMBOL[currency];
  if (abs >= 1_000_000) return `${sign}${symbol} ${oneDecimal.format(abs / 1_000_000)} M`;
  if (abs >= 1_000) return `${sign}${symbol} ${oneDecimal.format(abs / 1_000)} mil`;
  return `${sign}${symbol} ${oneDecimal.format(abs)}`;
}

const mediumDate = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeZone: DISPLAY_TIME_ZONE,
});

// ICU usa 12 h para es-AR (y con `hourCycle` cambia el patrón de la fecha): la hora se formatea
// aparte, en 24 h como se escribe en Argentina.
const shortTime = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: DISPLAY_TIME_ZONE,
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Instante (timestamp UTC) como fecha de Buenos Aires: "30 sept 2026". */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? mediumDate.format(date) : EMPTY_VALUE;
}

/** Instante con hora de Buenos Aires: "30 sept 2026, 23:00". */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? `${mediumDate.format(date)}, ${shortTime.format(date)}` : EMPTY_VALUE;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha sin hora ("YYYY-MM-DD") como "DD/MM/YYYY". Se parsea a mano: `new Date('2026-10-01')` es
 * medianoche UTC y en Buenos Aires mostraría el día anterior.
 */
export function formatDateOnly(value: string | null | undefined): string {
  const match = value ? DATE_ONLY.exec(value) : null;
  if (!match) return EMPTY_VALUE;
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return EMPTY_VALUE;
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** Período mensual: "Septiembre 2026" (`long`) o "sep 2026" (`short`). `month` va de 1 a 12. */
export function formatPeriod(
  year: number,
  month: number,
  style: 'long' | 'short' = 'long',
): string {
  const name = MONTHS[month - 1];
  if (!name || !Number.isInteger(year)) return EMPTY_VALUE;
  if (style === 'short') return `${name.slice(0, 3)} ${year}`;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Conteo con singular y plural: "1 propiedad", "12 propiedades". */
export function formatCount(count: number, singular: string, plural: string): string {
  return `${new Intl.NumberFormat('es-AR').format(count)} ${count === 1 ? singular : plural}`;
}
