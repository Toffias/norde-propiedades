import { describe, expect, it } from 'vitest';

import { EMPTY_APPRAISAL_RESULT, type AppraisalResult } from './appraisal-result';
import { appraisalReportFileName, checkAppraisalReportable } from './appraisal-report';
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
