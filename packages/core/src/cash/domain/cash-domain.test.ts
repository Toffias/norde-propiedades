import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import { movementSnapshot, TEST_NOW } from '../testing';

import { CashClosing, closingBalance } from './cash-closing';
import { CashMovement, type CashMovementDetails } from './cash-movement';
import { checkCashPeriodOpen } from './cash-period-access';
import {
  buenosAiresDate,
  currentCashPeriod,
  isCashDate,
  isCashPeriod,
  nextCashPeriod,
  periodOf,
} from './cash-period';

const ID = unwrap(parseId<'CashMovement'>('00000000-0000-7000-8000-000000000001'));
const CLOSING_ID = unwrap(parseId<'CashClosing'>('00000000-0000-7000-8000-000000000002'));

const DETAILS: CashMovementDetails = {
  date: '2026-10-20',
  kind: 'income',
  amountCents: 12_500_000n,
  concept: '  Seña   depto  ',
  notes: '  ',
};

function create(details: Partial<CashMovementDetails> = {}) {
  return CashMovement.create({
    id: ID,
    box: 'office',
    details: { ...DETAILS, ...details },
    actorId: 'user-1',
    now: TEST_NOW,
  });
}

describe('cash periods', () => {
  it('uses the Buenos Aires day, not the UTC one', () => {
    expect(buenosAiresDate(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10-31');
    expect(currentCashPeriod(new Date('2026-11-01T02:30:00Z'))).toBe('2026-10');
    expect(currentCashPeriod(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11');
  });

  it('validates periods and calendar dates', () => {
    expect(isCashPeriod('2026-10')).toBe(true);
    expect(isCashPeriod('2026-13')).toBe(false);
    expect(isCashDate('2028-02-29')).toBe(true);
    expect(isCashDate('2026-02-30')).toBe(false);
    expect(isCashDate('2026-2-3')).toBe(false);
  });

  it('moves to the next month across years', () => {
    expect(nextCashPeriod('2026-10')).toBe('2026-11');
    expect(nextCashPeriod('2026-12')).toBe('2027-01');
    expect(periodOf('2026-10-23')).toBe('2026-10');
  });
});

describe('checkCashPeriodOpen', () => {
  it('lets anyone write in the current month', () => {
    expect(checkCashPeriodOpen(['2026-10'], '2026-10', false).isOk()).toBe(true);
  });

  it('closes past months unless the user can manage them', () => {
    expect(unwrapErr(checkCashPeriodOpen(['2026-10', '2026-09'], '2026-10', false))).toEqual({
      type: 'CashPeriodClosed',
      period: '2026-09',
    });
    expect(checkCashPeriodOpen(['2026-09'], '2026-10', true).isOk()).toBe(true);
  });
});

describe('CashMovement', () => {
  it('cleans the concept and empty notes', () => {
    const movement = unwrap(create());

    expect(movement.toSnapshot()).toMatchObject({
      concept: 'Seña depto',
      notes: undefined,
      status: 'active',
      createdBy: 'user-1',
    });
    expect(movement.period).toBe('2026-10');
  });

  it('rejects invalid data', () => {
    expect(unwrapErr(create({ date: '2026-02-30' })).type).toBe('InvalidCashDate');
    expect(unwrapErr(create({ date: '2026-10-27' })).type).toBe('FutureCashDate');
    expect(unwrapErr(create({ amountCents: 0n })).type).toBe('InvalidCashAmount');
    expect(unwrapErr(create({ amountCents: 100_000_000_000_000n })).type).toBe('InvalidCashAmount');
    expect(unwrapErr(create({ concept: '   ' })).type).toBe('CashConceptRequired');
    expect(unwrapErr(create({ concept: 'x'.repeat(256) }))).toEqual({
      type: 'CashTextTooLong',
      field: 'concept',
    });
    expect(unwrapErr(create({ notes: 'x'.repeat(501) }))).toEqual({
      type: 'CashTextTooLong',
      field: 'notes',
    });
  });

  it('reports whether an update changed anything', () => {
    const movement = CashMovement.restore(movementSnapshot());
    const same = movementSnapshot();

    expect(unwrap(movement.update(same, TEST_NOW))).toBe(false);
    expect(unwrap(movement.update({ ...same, date: '2026-09-30' }, TEST_NOW))).toBe(true);
    expect(movement.period).toBe('2026-09');
  });

  it('cannot change once voided or deleted', () => {
    const movement = CashMovement.restore(movementSnapshot());

    unwrap(movement.deactivate('voided', 'user-2', TEST_NOW));

    expect(movement.toSnapshot()).toMatchObject({ status: 'voided', voidedBy: 'user-2' });
    expect(unwrapErr(movement.deactivate('deleted', 'user-2', TEST_NOW)).type).toBe(
      'CashMovementInactive',
    );
    expect(unwrapErr(movement.update(movementSnapshot(), TEST_NOW)).type).toBe(
      'CashMovementInactive',
    );
  });
});

describe('CashClosing', () => {
  const totals = { openingCents: 1000n, incomeCents: 500n, expenseCents: 200n };

  it('only closes months before the current one', () => {
    const input = {
      id: CLOSING_ID,
      box: 'office' as const,
      totals,
      actorId: 'user-1',
      now: TEST_NOW,
      current: '2026-10',
    };

    expect(unwrapErr(CashClosing.close({ ...input, period: '2026-10' })).type).toBe(
      'CashPeriodNotOver',
    );
    expect(
      unwrap(CashClosing.close({ ...input, period: '2026-09' })).toSnapshot().closingCents,
    ).toBe(1300n);
  });

  it('recalculates only when the totals changed', () => {
    const closing = unwrap(
      CashClosing.close({
        id: CLOSING_ID,
        box: 'office',
        period: '2026-09',
        current: '2026-10',
        totals,
        actorId: 'user-1',
        now: TEST_NOW,
      }),
    );

    expect(closing.recalculate(totals, TEST_NOW)).toBe(false);
    expect(closing.recalculate({ ...totals, expenseCents: 300n }, TEST_NOW)).toBe(true);
    expect(closing.toSnapshot().closingCents).toBe(
      closingBalance({ ...totals, expenseCents: 300n }),
    );
  });
});
