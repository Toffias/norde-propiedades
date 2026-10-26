import type { AppraisalValueRangeDto } from '@norde/core/appraisals/contracts';

import { formatMoney } from '../../lib/format';

/** "US$ 110.000 a US$ 120.000". */
export function formatAppraisalRange(range: AppraisalValueRangeDto): string {
  const { currency } = range;
  const min = formatMoney({ amountCents: range.minCents, currency });
  const max = formatMoney({ amountCents: range.maxCents, currency });
  return range.minCents === range.maxCents ? max : `${min} a ${max}`;
}
