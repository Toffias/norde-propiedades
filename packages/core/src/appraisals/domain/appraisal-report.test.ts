import { describe, expect, it } from 'vitest';

import { EMPTY_APPRAISAL_RESULT, type AppraisalResult } from './appraisal-result';
import {
  appraisalReportFigures,
  appraisalReportFileName,
  checkAppraisalReportable,
} from './appraisal-report';
import { APPRAISAL_STATUSES } from './appraisal-status';

const WITH_SALE: AppraisalResult = {
  ...EMPTY_APPRAISAL_RESULT,
  sale: { minCents: 10_000_000n, maxCents: 12_000_000n, currency: 'USD' },
};
const WITH_RENT: AppraisalResult = {
  ...EMPTY_APPRAISAL_RESULT,
  rent: { minCents: 50_000_000n, maxCents: 60_000_000n, currency: 'ARS' },
};

describe('checkAppraisalReportable', () => {
  it('allows appraised and converted appraisals with a suggested value', () => {
    for (const result of [WITH_SALE, WITH_RENT]) {
      expect(checkAppraisalReportable({ status: 'appraised', result }).isOk()).toBe(true);
      expect(checkAppraisalReportable({ status: 'converted', result }).isOk()).toBe(true);
    }
  });

  it('rejects an appraisal without a suggested value', () => {
    const outcome = checkAppraisalReportable({
      status: 'appraised',
      result: EMPTY_APPRAISAL_RESULT,
    });
    expect(outcome.isErr() && outcome.error).toEqual({ type: 'AppraisalNotReportable' });
  });

  it('rejects the other statuses even with a value', () => {
    const others = APPRAISAL_STATUSES.filter(
      (status) => status !== 'appraised' && status !== 'converted',
    );
    for (const status of others) {
      expect(checkAppraisalReportable({ status, result: WITH_SALE }).isErr()).toBe(true);
    }
  });
});

describe('appraisalReportFileName', () => {
  it('names the file after the appraisal code', () => {
    expect(appraisalReportFileName('TAS0001')).toBe('Tasacion-TAS0001.pdf');
  });
});

describe('appraisalReportFigures', () => {
  const sale = { minCents: 11_000_000n, maxCents: 12_000_000n, currency: 'USD' as const };

  it('divides the suggested values by the total surface', () => {
    const figures = appraisalReportFigures({
      surfaceTotalM2: 80,
      surfaceCoveredM2: 70,
      sale,
      rent: { minCents: 80_000_000n, maxCents: 80_000_000n, currency: 'ARS' },
      comparables: [],
    });
    expect(figures).toEqual({
      surfaceM2: 80,
      salePerM2: { minCents: 137_500n, maxCents: 150_000n, currency: 'USD' },
      rentPerM2: { minCents: 1_000_000n, maxCents: 1_000_000n, currency: 'ARS' },
      comparablesAverages: [],
    });
  });

  it('falls back to the covered surface, and has no value per m2 without a surface', () => {
    const covered = appraisalReportFigures({
      surfaceTotalM2: undefined,
      surfaceCoveredM2: 60,
      sale,
      rent: undefined,
      comparables: [],
    });
    expect(covered.surfaceM2).toBe(60);
    expect(covered.salePerM2).toEqual({ minCents: 183_333n, maxCents: 200_000n, currency: 'USD' });
    const none = appraisalReportFigures({
      surfaceTotalM2: 0,
      surfaceCoveredM2: undefined,
      sale,
      rent: undefined,
      comparables: [],
    });
    expect(none).toMatchObject({ surfaceM2: undefined, salePerM2: undefined });
  });

  it('averages the comparables with a surface, per currency', () => {
    const figures = appraisalReportFigures({
      surfaceTotalM2: undefined,
      surfaceCoveredM2: undefined,
      sale: undefined,
      rent: undefined,
      comparables: [
        { currency: 'USD', pricePerM2Cents: 180_000n },
        { currency: 'USD', pricePerM2Cents: undefined },
        { currency: 'ARS', pricePerM2Cents: 1_000_000n },
        { currency: 'USD', pricePerM2Cents: 190_001n },
      ],
    });
    expect(figures.comparablesAverages).toEqual([
      { currency: 'USD', pricePerM2Cents: 185_001n, count: 2 },
      { currency: 'ARS', pricePerM2Cents: 1_000_000n, count: 1 },
    ]);
  });
});
