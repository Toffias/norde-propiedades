import { err, ok, type Result } from '../../shared/domain/result';

import { isClosedCashPeriod, type CashPeriod } from './cash-period';

/** El mes ya cerró y el usuario no puede tocar meses cerrados. */
export interface CashPeriodClosedError {
  readonly type: 'CashPeriodClosed';
  readonly period: CashPeriod;
}

/**
 * En el mes vigente se carga, se edita y se anula; en un mes cerrado, solo quien puede tocar
 * meses cerrados (`allowClosed`). Al editar se controlan el mes de antes y el de después.
 */
export function checkCashPeriodOpen(
  periods: readonly CashPeriod[],
  current: CashPeriod,
  allowClosed: boolean,
): Result<void, CashPeriodClosedError> {
  if (allowClosed) return ok(undefined);
  const closed = periods.find((period) => isClosedCashPeriod(period, current));
  return closed === undefined ? ok(undefined) : err({ type: 'CashPeriodClosed', period: closed });
}
