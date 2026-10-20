import type { PriceCurrency, PropertyKind } from './property-catalog';

// Cómo se traduce una fila de la exportación de propiedades de Tokko (`.csv`). Decidido con Norde
// el 2026-10-20 (`docs/negocio/decisiones.md`).

/** Sin acentos, mayúsculas ni espacios de más. */
function key(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const KINDS: Readonly<Record<string, PropertyKind>> = {
  departamento: 'apartment',
  casa: 'house',
  ph: 'ph',
  terreno: 'land',
  oficina: 'office',
  local: 'commercial',
  cochera: 'garage',
  galpon: 'warehouse',
  deposito: 'storage',
};

export function tokkoPropertyKind(raw: string): PropertyKind | undefined {
  return KINDS[key(raw)];
}

/**
 * Dónde está la propiedad. En el catálogo (Argentina): provincia, partido o ciudad y, si hay, el
 * barrio o la localidad. Afuera del catálogo (otro país o una región que no se conoce): los textos.
 */
export type TokkoPlace =
  | {
      readonly inCatalog: true;
      readonly province: string;
      readonly city: string;
      readonly neighborhood: string | undefined;
    }
  | {
      readonly inCatalog: false;
      readonly province: string;
      readonly city: string;
      readonly neighborhood: string;
    };

/** Las localidades del GBA y la costa que Tokko exporta sin su partido. */
const PARTIDOS: Readonly<Record<string, string>> = {
  'ramos mejia': 'La Matanza',
  'ramos mejia norte': 'La Matanza',
  'ramos mejia sur': 'La Matanza',
  'lomas del mirador': 'La Matanza',
  'san justo': 'La Matanza',
  tablada: 'La Matanza',
  'villa madero': 'La Matanza',
  ciudadela: 'Tres de Febrero',
  haedo: 'Morón',
  olivos: 'Vicente López',
  'pinamar norte': 'Pinamar',
};

/** Las regiones de Tokko que son de la provincia de Buenos Aires. */
const BUENOS_AIRES_REGIONS = new Set([
  'g.b.a. zona oeste',
  'g.b.a. zona sur',
  'g.b.a. zona norte',
  'costa atlantica',
  'buenos aires',
]);

/**
 * "Capital Federal" es CABA, con el barrio como barrio. Las regiones del GBA y la costa son de
 * Buenos Aires: la localidad va con su partido (Ramos Mejía → La Matanza); si no está en la tabla,
 * la localidad es el partido. Otro país u otra región quedan como texto.
 */
export function tokkoPlace(country: string, region: string, neighborhood: string): TokkoPlace {
  const barrio = neighborhood.trim().replace(/\s+/g, ' ');
  if (key(country) === 'argentina') {
    if (key(region) === 'capital federal') {
      return { inCatalog: true, province: 'CABA', city: 'CABA', neighborhood: barrio || undefined };
    }
    if (BUENOS_AIRES_REGIONS.has(key(region)) && barrio !== '') {
      const partido = PARTIDOS[key(barrio)];
      return partido === undefined
        ? { inCatalog: true, province: 'Buenos Aires', city: barrio, neighborhood: undefined }
        : { inCatalog: true, province: 'Buenos Aires', city: partido, neighborhood: barrio };
    }
  }
  return {
    inCatalog: false,
    province: key(country) === 'argentina' ? region.trim() : country.trim(),
    city: key(country) === 'argentina' ? '' : region.trim(),
    neighborhood: barrio,
  };
}

/** Un precio de Tokko: "USD 130.000" o "$ 630.000"; con varios ("$ 9 | USD 120.000"), el de dólares. */
export interface TokkoPrice {
  readonly currency: PriceCurrency;
  readonly cents: bigint;
}

/** Pesos o dólares, en miles con punto: "USD 1.250.000". */
function onePrice(raw: string): TokkoPrice | undefined {
  const match = /^\s*(USD|U\$S|\$)\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*$/i.exec(raw);
  if (!match?.[1] || !match[2]) return undefined;
  const currency: PriceCurrency = match[1] === '$' ? 'ARS' : 'USD';
  return { currency, cents: BigInt(match[2].replace(/\./g, '')) * 100n };
}

/** `undefined` si no hay precio ("-"); `null` si el texto no se entiende. */
export function tokkoPrice(raw: string | undefined): TokkoPrice | null | undefined {
  const text = (raw ?? '').trim();
  if (text === '' || /^-+$/.test(text)) return undefined;
  const prices = text.split('|').map(onePrice);
  if (prices.some((price) => price === undefined)) return null;
  const valid = prices.filter((price): price is TokkoPrice => price !== undefined);
  return valid.find((price) => price.currency === 'USD') ?? valid[0] ?? null;
}

/**
 * Una medida de Tokko ("300.00 m2", "8.66 m") en número. `0.00` es "sin dato". `null` si el texto
 * no se entiende.
 */
export function tokkoMeasure(raw: string | undefined): number | null | undefined {
  const text = (raw ?? '').trim();
  if (text === '' || /^-+$/.test(text)) return undefined;
  const match = /^(\d+(?:\.\d{1,2})?)\s*(m2|m²|m)?$/i.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return value === 0 ? undefined : value;
}

/** Una cantidad (ambientes, baños, años). `null` si no es un entero. */
export function tokkoCount(raw: string | undefined): number | null | undefined {
  const text = (raw ?? '').trim();
  // Tokko exporta "-1" para "sin dato" (por ejemplo, en la antigüedad).
  if (text === '' || /^-+$/.test(text) || text === '-1') return undefined;
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

/** Las expensas en pesos ("60000"); 0 es "sin expensas". `null` si no es un monto. */
export function tokkoExpensesCents(raw: string | undefined): bigint | null | undefined {
  const text = (raw ?? '').trim().replace(/^\$\s*/, '');
  if (text === '' || /^-+$/.test(text)) return undefined;
  if (!/^(\d{1,3}(?:\.\d{3})+|\d+)$/.test(text)) return null;
  const pesos = BigInt(text.replace(/\./g, ''));
  return pesos === 0n ? undefined : pesos * 100n;
}

/** "AV. RIVADAVIA 9540 + EN POZO": Tokko suma el estado de obra al nombre del emprendimiento. */
export function tokkoDevelopmentName(raw: string | undefined): string | undefined {
  const name = (raw ?? '')
    .replace(/\s*\+.*$/s, '')
    .trim()
    .replace(/\s+/g, ' ');
  return name === '' ? undefined : name;
}

/** Si dos nombres de emprendimiento son el mismo (sin mayúsculas, acentos ni puntos). */
export function sameDevelopmentName(a: string, b: string): boolean {
  const clean = (value: string) => key(value).replace(/[.,]/g, '');
  return clean(a) === clean(b);
}

/**
 * Lo que Tokko tiene y Norde no modela (plantas, ocupación, zonificación, superficie descubierta):
 * va a los comentarios internos, un dato por línea.
 */
export function tokkoInternalComments(data: {
  readonly floors: string | undefined;
  readonly occupation: string | undefined;
  readonly zoning: string | undefined;
  readonly uncoveredM2: number | undefined;
}): string | undefined {
  const value = (raw: string | undefined) => {
    const text = (raw ?? '').trim().replace(/\s+/g, ' ');
    return text === '' || /^-+$/.test(text) || text === '0' ? undefined : text;
  };
  const lines = [
    value(data.floors) && `Plantas: ${value(data.floors) ?? ''}`,
    value(data.occupation) && `Ocupación: ${value(data.occupation) ?? ''}`,
    value(data.zoning) && `Zonificación: ${value(data.zoning) ?? ''}`,
    data.uncoveredM2 !== undefined &&
      `Superficie descubierta: ${String(data.uncoveredM2).replace('.', ',')} m²`,
  ].filter((line): line is string => typeof line === 'string');
  return lines.length === 0 ? undefined : `Datos de Tokko\n${lines.join('\n')}`;
}

export interface TokkoAddress {
  readonly street: string;
  readonly streetNumber: string | undefined;
  readonly floor: string | undefined;
  readonly unit: string | undefined;
}

/**
 * "Cafayate 1581, PB", "Av. Rivadavia 9540 4º A" o "Paso 1627": la calle, el número y, si hay, el
 * piso y la unidad. Lo que no se entiende queda entero en la calle.
 */
export function tokkoAddress(raw: string): TokkoAddress {
  const text = raw.trim().replace(/\s+/g, ' ');
  const match = /^(.*?\D)\s*(\d{1,6}[A-Za-z]?)(?:\s*,\s*|\s+)?(.*)$/.exec(text);
  const street = match?.[1]?.trim().replace(/,$/, '');
  if (!match?.[2] || !street) {
    return { street: text, streetNumber: undefined, floor: undefined, unit: undefined };
  }
  const rest = (match[3] ?? '').trim();
  if (rest === '') return { street, streetNumber: match[2], floor: undefined, unit: undefined };
  const position = tokkoPosition(rest);
  return { street, streetNumber: match[2], floor: position.floor, unit: position.unit };
}

/** "Departamento", "Depto.", "Dpto", "UF" o "Unidad" antes de la unidad. */
const UNIT_WORD = String.raw`(?:departamento|depto\.?|dpto\.?|uf|unidad)`;

/**
 * El piso y la unidad: "4º A", "4ºB", "PB", "Planta Baja", "PB 9", "Piso 4 Departamento A",
 * "4º UF 9", "Depto 9" o "PB LOCAL". Lo que no se entiende queda entero como piso.
 */
function tokkoPosition(raw: string): {
  readonly floor: string | undefined;
  readonly unit: string | undefined;
} {
  const text = raw.replace(/planta baja/i, 'PB');
  const onlyUnit = new RegExp(String.raw`^${UNIT_WORD}\s*[º°]?\s*([A-Za-z0-9]{1,6})$`, 'i').exec(
    text,
  );
  if (onlyUnit?.[1]) return { floor: undefined, unit: onlyUnit[1].toUpperCase() };
  const position = new RegExp(
    String.raw`^(?:piso\s*)?(PB|\d{1,3})\s*[º°]?\s*(?:piso\s*)?(?:${UNIT_WORD}\s*[º°]?\s*)?["'-]?\s*([A-Za-z0-9]{1,6})?$`,
    'i',
  ).exec(text);
  if (!position?.[1]) return { floor: raw, unit: undefined };
  return { floor: position[1].toUpperCase(), unit: position[2]?.toUpperCase() };
}

/**
 * El código de referencia de Tokko como código de Norde: en mayúsculas y con guiones en lugar de
 * espacios ("NBU12345 AP1234567" → "NBU12345-AP1234567").
 */
export function tokkoReferenceCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-');
}
