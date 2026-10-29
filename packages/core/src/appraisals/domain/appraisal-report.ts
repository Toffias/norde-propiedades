import { err, ok, type Result } from '../../shared/domain/result';

import {
  hasSuggestedValue,
  pricePerM2Cents,
  type AppraisalCurrency,
  type AppraisalResult,
  type AppraisalValueRange,
} from './appraisal-result';
import type { AppraisalStatus } from './appraisal-status';

// El informe de la tasación en PDF, el que se le entrega al propietario con la marca de Norde.

/** El PDF sale de una tasación tasada (o ya convertida en propiedad) que tiene un valor sugerido. */
export interface AppraisalNotReportableError {
  readonly type: 'AppraisalNotReportable';
}

const REPORTABLE_STATUSES: readonly AppraisalStatus[] = ['appraised', 'converted'];

/** ¿Se puede armar el PDF? Sin valor sugerido no hay nada que informar. */
export function checkAppraisalReportable(appraisal: {
  readonly status: AppraisalStatus;
  readonly result: Pick<AppraisalResult, 'sale' | 'rent'>;
}): Result<void, AppraisalNotReportableError> {
  return REPORTABLE_STATUSES.includes(appraisal.status) && hasSuggestedValue(appraisal.result)
    ? ok(undefined)
    : err({ type: 'AppraisalNotReportable' });
}

/** Nombre del archivo que se descarga: `Tasacion-TAS0001.pdf`. */
export function appraisalReportFileName(code: string): string {
  return `Tasacion-${code}.pdf`;
}

/** El promedio por m² de los comparables de una moneda que tienen superficie. */
export interface ComparablesAverage {
  readonly currency: AppraisalCurrency;
  readonly pricePerM2Cents: bigint;
  /** Cuántos comparables entran en el promedio. */
  readonly count: number;
}

/** Las cifras que el informe muestra además de los valores cargados. */
export interface AppraisalReportFigures {
  /** La superficie del valor por m²: la total o, si no está, la cubierta. */
  readonly surfaceM2: number | undefined;
  readonly salePerM2: AppraisalValueRange | undefined;
  readonly rentPerM2: AppraisalValueRange | undefined;
  /** Uno por moneda, en el orden en que aparecen. */
  readonly comparablesAverages: readonly ComparablesAverage[];
}

function rangePerM2(
  range: AppraisalValueRange | undefined,
  surfaceM2: number | undefined,
): AppraisalValueRange | undefined {
  if (range === undefined) return undefined;
  const min = pricePerM2Cents(range.minCents, surfaceM2);
  const max = pricePerM2Cents(range.maxCents, surfaceM2);
  return min === undefined || max === undefined
    ? undefined
    : { minCents: min, maxCents: max, currency: range.currency };
}

/**
 * El valor sugerido por m² (sobre la superficie total o, si no está, la cubierta) y el promedio por
 * m² de los comparables, por moneda (redondeado al centavo). Sin superficie, no hay valor por m².
 */
export function appraisalReportFigures(appraisal: {
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
  readonly sale: AppraisalValueRange | undefined;
  readonly rent: AppraisalValueRange | undefined;
  readonly comparables: readonly {
    readonly currency: AppraisalCurrency;
    readonly pricePerM2Cents: bigint | undefined;
  }[];
}): AppraisalReportFigures {
  const surface = [appraisal.surfaceTotalM2, appraisal.surfaceCoveredM2].find(
    (value) => value !== undefined && value > 0,
  );
  const sums = new Map<AppraisalCurrency, { total: bigint; count: number }>();
  for (const comparable of appraisal.comparables) {
    if (comparable.pricePerM2Cents === undefined) continue;
    const current = sums.get(comparable.currency) ?? { total: 0n, count: 0 };
    sums.set(comparable.currency, {
      total: current.total + comparable.pricePerM2Cents,
      count: current.count + 1,
    });
  }
  const comparablesAverages = [...sums].map(([currency, { total, count }]) => {
    const divisor = BigInt(count);
    return { currency, pricePerM2Cents: (total + divisor / 2n) / divisor, count };
  });
  return {
    surfaceM2: surface,
    salePerM2: rangePerM2(appraisal.sale, surface),
    rentPerM2: rangePerM2(appraisal.rent, surface),
    comparablesAverages,
  };
}
