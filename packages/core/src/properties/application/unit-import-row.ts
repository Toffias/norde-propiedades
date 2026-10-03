import { err, ok, type Result } from '../../shared';
import {
  CURRENCIES,
  PROPERTY_STATUS_VALUES,
  UNIT_PRICE_ON_REQUEST_LABEL,
  UNIT_STATUS_LABELS,
} from '../contracts';
import type { UnitImportField, UnitImportMapping } from '../domain/development-unit-import';
import {
  PROPERTY_KIND_LABELS,
  PROPERTY_KINDS,
  type PriceCurrency,
  type PropertyKind,
  type PropertyOperationKind,
} from '../domain/property-catalog';
import type { PropertyStatus } from '../domain/property-status';

// Una fila del Excel de unidades, leída con el mapeo elegido. Las celdas vacías no cambian nada:
// la importación nunca borra un dato que la planilla no trae.

/** Una operación que trae la fila: tiene moneda, precio o "Consultar". */
export interface ImportedOperation {
  readonly operation: PropertyOperationKind;
  readonly currency: PriceCurrency | undefined;
  /**
   * El precio de la planilla. `undefined`: la celda está vacía y no cambia el precio cargado.
   * `{ cents: undefined }`: dice "Consultar" y la operación queda sin precio.
   */
  readonly price: { readonly cents: bigint | undefined } | undefined;
}

export interface ImportedUnit {
  readonly floor: string | undefined;
  readonly unit: string;
  readonly propertyType: PropertyKind | undefined;
  readonly rooms: number | undefined;
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
  readonly operations: readonly ImportedOperation[];
  readonly status: PropertyStatus | undefined;
}

export interface UnitRowProblem {
  readonly code: 'missing_unit' | 'invalid_value';
  readonly field: UnitImportField | undefined;
}

const MAX_DESIGNATION_LENGTH = 10;
const MAX_ROOMS = 999;
const MAX_SURFACE_M2 = 10_000_000;
/** Doce dígitos de unidades, como el alta (`AmountSchema`). */
const MAX_PRICE_CENTS = 10n ** 14n - 1n;

const OPERATION_COLUMNS: readonly (readonly [
  PropertyOperationKind,
  UnitImportField,
  UnitImportField,
])[] = [
  ['sale', 'saleCurrency', 'salePrice'],
  ['rent', 'rentCurrency', 'rentPrice'],
  ['temporary_rent', 'temporaryRentCurrency', 'temporaryRentPrice'],
];

/** Sin mayúsculas, acentos ni espacios de más. */
function normalize(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cómo se escribe la moneda en una lista de precios. */
const CURRENCY_SYNONYMS: Readonly<Record<PriceCurrency, readonly string[]>> = {
  USD: ['usd', 'u$s', 'us$', 'u$d', 'dolares', 'dolar'],
  ARS: ['ars', '$', 'pesos', 'peso'],
};

function currencyOf(raw: string): PriceCurrency | undefined {
  const key = normalize(raw);
  return CURRENCIES.find((currency) => CURRENCY_SYNONYMS[currency].includes(key));
}

function propertyTypeOf(raw: string): PropertyKind | undefined {
  const key = normalize(raw);
  return PROPERTY_KINDS.find(
    (kind) => normalize(PROPERTY_KIND_LABELS[kind]) === key || kind === key,
  );
}

function statusOf(raw: string): PropertyStatus | undefined {
  const key = normalize(raw);
  return PROPERTY_STATUS_VALUES.find(
    (status) => normalize(UNIT_STATUS_LABELS[status]) === key || status === key,
  );
}

/**
 * Un número con hasta dos decimales, como lo escribe una planilla argentina ("120.000", "45,5") o
 * como lo lee el Excel de una celda numérica ("120000", "45.5"). Devuelve centésimos, exactos.
 */
export function parseHundredths(raw: string): bigint | undefined {
  const text = raw.replace(/\s/g, '');
  let plain: string;
  if (/^\d+$/.test(text)) plain = text;
  else if (/^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(text) || /^\d+,\d{1,2}$/.test(text)) {
    plain = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) plain = text.replace(/\./g, '');
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(text)) plain = text.replace(/,/g, '');
  else if (/^\d+\.\d{1,2}$/.test(text)) plain = text;
  else return undefined;
  const [units = '0', fraction = ''] = plain.split('.');
  return BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/** Precio con o sin moneda escrita ("USD 120.000"): la moneda escrita se usa si no hay columna. */
function priceOf(
  raw: string,
):
  | { readonly kind: 'price'; readonly cents: bigint; readonly currency: PriceCurrency | undefined }
  | { readonly kind: 'on_request' }
  | undefined {
  if (normalize(raw) === normalize(UNIT_PRICE_ON_REQUEST_LABEL)) return { kind: 'on_request' };
  const match = /^\s*(u\$s|us\$|u\$d|usd|ars|\$)?\s*([\d.,\s]+?)\s*(usd|ars)?\s*$/i.exec(raw);
  if (!match?.[2]) return undefined;
  const cents = parseHundredths(match[2]);
  if (cents === undefined || cents > MAX_PRICE_CENTS) return undefined;
  const written = match[1] ?? match[3];
  return {
    kind: 'price',
    cents,
    currency: written === undefined ? undefined : currencyOf(written),
  };
}

const problem = (code: UnitRowProblem['code'], field?: UnitImportField): UnitRowProblem => ({
  code,
  field,
});

/** Una fila del Excel como datos de unidad, con el mapeo elegido. */
export function readUnitImportRow(
  cells: readonly (string | undefined)[],
  mapping: UnitImportMapping,
): Result<ImportedUnit, UnitRowProblem> {
  const value = (field: UnitImportField): string | undefined => {
    const column = mapping[field];
    const raw = column === undefined ? undefined : cells[column]?.trim();
    return raw === '' ? undefined : raw;
  };

  const unit = value('unit');
  if (unit === undefined) return err(problem('missing_unit'));
  if (unit.length > MAX_DESIGNATION_LENGTH) return err(problem('invalid_value', 'unit'));
  const floor = value('floor');
  if (floor !== undefined && floor.length > MAX_DESIGNATION_LENGTH) {
    return err(problem('invalid_value', 'floor'));
  }

  const rawType = value('propertyType');
  const propertyType = rawType === undefined ? undefined : propertyTypeOf(rawType);
  if (rawType !== undefined && propertyType === undefined) {
    return err(problem('invalid_value', 'propertyType'));
  }

  const rawRooms = value('rooms');
  const rooms = rawRooms === undefined ? undefined : Number(rawRooms);
  if (rooms !== undefined && (!Number.isInteger(rooms) || rooms < 0 || rooms > MAX_ROOMS)) {
    return err(problem('invalid_value', 'rooms'));
  }

  const surface = (field: UnitImportField): Result<number | undefined, UnitRowProblem> => {
    const raw = value(field);
    if (raw === undefined) return ok(undefined);
    const hundredths = parseHundredths(raw);
    const m2 = hundredths === undefined ? undefined : Number(hundredths) / 100;
    if (m2 === undefined || m2 > MAX_SURFACE_M2) return err(problem('invalid_value', field));
    return ok(m2);
  };
  const surfaceTotalM2 = surface('surfaceTotalM2');
  if (surfaceTotalM2.isErr()) return err(surfaceTotalM2.error);
  const surfaceCoveredM2 = surface('surfaceCoveredM2');
  if (surfaceCoveredM2.isErr()) return err(surfaceCoveredM2.error);

  const operations: ImportedOperation[] = [];
  for (const [operation, currencyField, priceField] of OPERATION_COLUMNS) {
    const rawCurrency = value(currencyField);
    const rawPrice = value(priceField);
    if (rawCurrency === undefined && rawPrice === undefined) continue;
    let currency = rawCurrency === undefined ? undefined : currencyOf(rawCurrency);
    if (rawCurrency !== undefined && currency === undefined) {
      return err(problem('invalid_value', currencyField));
    }
    let price: ImportedOperation['price'];
    if (rawPrice !== undefined) {
      const parsed = priceOf(rawPrice);
      if (parsed === undefined) return err(problem('invalid_value', priceField));
      price = { cents: parsed.kind === 'price' ? parsed.cents : undefined };
      if (parsed.kind === 'price') currency ??= parsed.currency;
    }
    operations.push({ operation, currency, price });
  }

  const rawStatus = value('status');
  const status = rawStatus === undefined ? undefined : statusOf(rawStatus);
  if (rawStatus !== undefined && status === undefined)
    return err(problem('invalid_value', 'status'));

  return ok({
    floor,
    unit,
    propertyType,
    rooms,
    surfaceTotalM2: surfaceTotalM2.value,
    surfaceCoveredM2: surfaceCoveredM2.value,
    operations,
    status,
  });
}
