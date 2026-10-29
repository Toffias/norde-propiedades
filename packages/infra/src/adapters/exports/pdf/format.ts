// Cómo se escriben los valores en los PDF (#175, "Superar" 5): "USD 370.000", "193 m²", "1 año",
// expensas con moneda. Entre el número y su unidad va un espacio duro, para que nunca se partan en
// dos líneas.

const NBSP = ' ';

const integerFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** Centavos → "USD 370.000", redondeado a la unidad (exacto: los centavos no pasan por `number`). */
export function formatMoney(currency: string, cents: bigint): string {
  const units = (cents >= 0n ? cents + 50n : cents - 50n) / 100n;
  return `${currency}${NBSP}${integerFormat.format(units)}`;
}

/** "193 m²", "48,87 m²". */
export function formatSquareMeters(value: number): string {
  return `${decimalFormat.format(value)}${NBSP}m²`;
}

/** "8,7 m". */
export function formatMeters(value: number): string {
  return `${decimalFormat.format(value)}${NBSP}m`;
}

/** "1 año", "30 años"; 0 es "A estrenar". */
export function formatAge(years: number): string {
  if (years === 0) return 'A estrenar';
  return `${integerFormat.format(years)}${NBSP}${years === 1 ? 'año' : 'años'}`;
}

/** "1 dormitorio", "3 dormitorios". */
export function formatCount(value: number, one: string, many: string): string {
  return `${integerFormat.format(value)}${NBSP}${value === 1 ? one : many}`;
}

/** E.164 → algo legible: "+54 9 11 6689-9124" en el AMBA; si no, tal cual. */
export function formatPhone(e164: string): string {
  const amba = /^\+5491(1)(\d{4})(\d{4})$/.exec(e164);
  if (amba) return `+54 9 11 ${amba[2] ?? ''}-${amba[3] ?? ''}`;
  const landline = /^\+5411(\d{4})(\d{4})$/.exec(e164);
  if (landline) return `+54 11 ${landline[1] ?? ''}-${landline[2] ?? ''}`;
  const argentina = /^\+54(9?)(\d+)$/.exec(e164);
  if (argentina) return `+54 ${argentina[1] === '9' ? '9 ' : ''}${argentina[2] ?? ''}`;
  return e164;
}

/**
 * La descripción como párrafos: normaliza saltos y espacios, y saca el HTML que arrastra desde
 * otros sistemas (Tokko la guarda con etiquetas), para que todo salga con la misma letra.
 */
export function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter((line) => line !== '')
        .join('\n'),
    )
    .filter((paragraph) => paragraph !== '');
}
