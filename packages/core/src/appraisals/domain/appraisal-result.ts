import { err, ok, type Result } from '../../shared/domain/result';

/** Monedas de los valores sugeridos y de los comparables: las mismas que la propiedad. */
export const APPRAISAL_CURRENCIES = ['ARS', 'USD'] as const;
export type AppraisalCurrency = (typeof APPRAISAL_CURRENCIES)[number];

/** Valor sugerido de una operación: de `minCents` a `maxCents`, en centavos. */
export interface AppraisalValueRange {
  readonly minCents: bigint;
  readonly maxCents: bigint;
  readonly currency: AppraisalCurrency;
}

/**
 * Propiedad parecida de la zona, publicada o vendida, que respalda el valor sugerido. Se carga a
 * mano: suele ser de un portal o de otra inmobiliaria.
 */
export interface AppraisalComparable {
  readonly address: string;
  readonly priceCents: bigint;
  readonly currency: AppraisalCurrency;
  /** Metros cuadrados, con hasta dos decimales. */
  readonly surfaceM2: number | undefined;
  readonly url: string | undefined;
  readonly note: string | undefined;
}

/** Lo que concluye la tasación. */
export interface AppraisalResult {
  readonly sale: AppraisalValueRange | undefined;
  readonly rent: AppraisalValueRange | undefined;
  readonly comparables: readonly AppraisalComparable[];
  readonly observations: string | undefined;
}

export const EMPTY_APPRAISAL_RESULT: AppraisalResult = {
  sale: undefined,
  rent: undefined,
  comparables: [],
  observations: undefined,
};

export const MAX_APPRAISAL_COMPARABLES = 20;

export type AppraisalValueOperation = 'sale' | 'rent';

/** Un monto negativo, o un mínimo mayor que el máximo. */
export interface InvalidValueRangeError {
  readonly type: 'InvalidValueRange';
  readonly operation: AppraisalValueOperation;
}
/** Un comparable con precio o superficie negativos o sin dirección; `index` empieza en 0. */
export interface InvalidComparableError {
  readonly type: 'InvalidComparable';
  readonly index: number;
}
export interface TooManyComparablesError {
  readonly type: 'TooManyComparables';
  readonly max: number;
}

export type InvalidAppraisalResultError =
  InvalidValueRangeError | InvalidComparableError | TooManyComparablesError;

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function validRange(range: AppraisalValueRange | undefined): boolean {
  return range === undefined || (range.minCents >= 0n && range.minCents <= range.maxCents);
}

/** Valida el resultado y normaliza los textos. */
export function cleanAppraisalResult(
  result: AppraisalResult,
): Result<AppraisalResult, InvalidAppraisalResultError> {
  if (!validRange(result.sale)) return err({ type: 'InvalidValueRange', operation: 'sale' });
  if (!validRange(result.rent)) return err({ type: 'InvalidValueRange', operation: 'rent' });
  if (result.comparables.length > MAX_APPRAISAL_COMPARABLES) {
    return err({ type: 'TooManyComparables', max: MAX_APPRAISAL_COMPARABLES });
  }
  const comparables: AppraisalComparable[] = [];
  for (const [index, comparable] of result.comparables.entries()) {
    const address = comparable.address.trim();
    const negativeSurface = comparable.surfaceM2 !== undefined && comparable.surfaceM2 < 0;
    if (address === '' || comparable.priceCents < 0n || negativeSurface) {
      return err({ type: 'InvalidComparable', index });
    }
    comparables.push({
      address,
      priceCents: comparable.priceCents,
      currency: comparable.currency,
      surfaceM2: comparable.surfaceM2,
      url: optionalText(comparable.url),
      note: optionalText(comparable.note),
    });
  }
  return ok({
    sale: result.sale,
    rent: result.rent,
    comparables,
    observations: optionalText(result.observations),
  });
}

/** Tiene al menos un valor sugerido, de venta o de alquiler. */
export function hasSuggestedValue(result: Pick<AppraisalResult, 'sale' | 'rent'>): boolean {
  return result.sale !== undefined || result.rent !== undefined;
}

/**
 * Valor por metro cuadrado de un comparable, en centavos y redondeado. `undefined` sin superficie.
 * Exacto: la superficie se pasa a centésimas de metro y la división se hace en `bigint`.
 */
export function comparablePricePerM2Cents(comparable: AppraisalComparable): bigint | undefined {
  const { surfaceM2 } = comparable;
  if (surfaceM2 === undefined || surfaceM2 <= 0) return undefined;
  const surfaceCentiM2 = BigInt(Math.round(surfaceM2 * 100));
  const scaled = comparable.priceCents * 100n;
  return (scaled + surfaceCentiM2 / 2n) / surfaceCentiM2;
}

function sameRange(a: AppraisalValueRange | undefined, b: AppraisalValueRange | undefined) {
  if (a === undefined || b === undefined) return a === b;
  return a.minCents === b.minCents && a.maxCents === b.maxCents && a.currency === b.currency;
}

function sameComparable(a: AppraisalComparable, b: AppraisalComparable): boolean {
  return (
    a.address === b.address &&
    a.priceCents === b.priceCents &&
    a.currency === b.currency &&
    a.surfaceM2 === b.surfaceM2 &&
    a.url === b.url &&
    a.note === b.note
  );
}

export function sameAppraisalResult(a: AppraisalResult, b: AppraisalResult): boolean {
  return (
    sameRange(a.sale, b.sale) &&
    sameRange(a.rent, b.rent) &&
    a.observations === b.observations &&
    a.comparables.length === b.comparables.length &&
    a.comparables.every((comparable, index) => {
      const other = b.comparables[index];
      return other !== undefined && sameComparable(comparable, other);
    })
  );
}
