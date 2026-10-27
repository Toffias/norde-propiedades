import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { CloseCashPeriods } from '../commands/close-cash-periods';
import {
  CASHIER_ID,
  InMemoryCashQuery,
  InMemoryCashUnitOfWork,
  InMemoryCashUserNames,
  MOVEMENT_ID,
  movementSnapshot,
  TEST_CASH_ADMIN,
  TEST_CASHIER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';

import { GetCashPeriod } from './get-cash-period';
import { ListCashMovements } from './list-cash-movements';
import { ListCashPeriods } from './list-cash-periods';

function setup() {
  const uow = new InMemoryCashUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  const cash = new InMemoryCashQuery(uow.movements, uow.closings);
  uow.movements.add(
    movementSnapshot({
      id: '00000000-0000-7000-8000-0000000000e2',
      date: '2026-09-10',
      kind: 'income',
      amountCents: 10_000_000n,
    }),
    movementSnapshot({
      id: '00000000-0000-7000-8000-0000000000e3',
      date: '2026-10-02',
      kind: 'income',
      amountCents: 500_000n,
      createdAt: new Date('2026-10-02T12:00:00Z'),
    }),
    movementSnapshot(),
    movementSnapshot({
      id: '00000000-0000-7000-8000-0000000000e4',
      status: 'voided',
      amountCents: 99n,
    }),
    movementSnapshot({ id: '00000000-0000-7000-8000-0000000000e5', box: 'osvaldo' }),
  );
  return {
    uow,
    get: new GetCashPeriod({ uow, clock }),
    list: new ListCashMovements({
      cash,
      users: new InMemoryCashUserNames(new Map([[CASHIER_ID, 'Camila']])),
      clock,
    }),
    periods: new ListCashPeriods({ cash, clock }),
    close: new CloseCashPeriods({ uow, clock, ids: new SequentialIdGenerator() }),
  };
}

describe('GetCashPeriod', () => {
  it('sums the current month of one box, skipping voided movements', async () => {
    const s = setup();

    const summary = unwrap(await s.get.execute({ box: 'office' }, TEST_CASHIER));

    expect(summary).toMatchObject({
      period: '2026-10',
      currentPeriod: '2026-10',
      openingCents: 10_000_000n,
      incomeCents: 500_000n,
      expenseCents: 1_500_000n,
      closingCents: 9_000_000n,
      closedAt: undefined,
      lastMovementId: MOVEMENT_ID,
      can: { create: true, update: true, void: true, delete: false },
    });
  });

  it('shows a closed month read-only to a cashier and writable to an admin', async () => {
    const s = setup();
    unwrap(await s.close.execute(undefined, TEST_CASHIER));

    const cashier = unwrap(await s.get.execute({ box: 'office', period: '2026-09' }, TEST_CASHIER));
    const admin = unwrap(
      await s.get.execute({ box: 'office', period: '2026-09' }, TEST_CASH_ADMIN),
    );

    expect(cashier.closedAt).toEqual(TEST_NOW);
    expect(cashier.can).toEqual({ create: false, update: false, void: false, delete: false });
    expect(admin.can).toEqual({ create: true, update: true, void: true, delete: true });
  });

  it('rejects future months and users without cash:read', async () => {
    const s = setup();

    expect(
      unwrapErr(await s.get.execute({ box: 'office', period: '2026-11' }, TEST_CASHIER)).type,
    ).toBe('FutureCashPeriod');
    expect(unwrapErr(await s.get.execute({ box: 'office' }, TEST_OUTSIDER)).type).toBe('Forbidden');
  });
});

describe('ListCashMovements', () => {
  it('pages the month with the running balance and who loaded each one', async () => {
    const s = setup();

    const page = unwrap(
      await s.list.execute({ box: 'office', page: 1, pageSize: 1 }, TEST_CASHIER),
    );

    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      expect.objectContaining({
        date: '2026-10-02',
        balanceCents: 10_500_000n,
        createdByName: 'Camila',
      }),
    ]);
  });

  it('keeps the balance when sorted from the newest', async () => {
    const s = setup();

    const page = unwrap(await s.list.execute({ box: 'office', sort: '-date' }, TEST_CASHIER));

    expect(page.items.map((m) => m.balanceCents)).toEqual([9_000_000n, 10_500_000n]);
  });

  it('rejects users without cash:read and invalid months', async () => {
    const s = setup();

    expect(unwrapErr(await s.list.execute({ box: 'office' }, TEST_OUTSIDER)).type).toBe(
      'Forbidden',
    );
    expect(
      unwrapErr(await s.list.execute({ box: 'office', period: '2026-13' }, TEST_CASHIER)).type,
    ).toBe('InvalidInput');
  });
});

describe('ListCashPeriods', () => {
  it('lists the closed months and the current one, newest first', async () => {
    const s = setup();
    unwrap(await s.close.execute(undefined, TEST_CASHIER));

    const page = unwrap(await s.periods.execute({ box: 'office' }, TEST_CASHIER));

    expect(page.items).toEqual([
      { period: '2026-10', closingCents: undefined, isCurrent: true },
      { period: '2026-09', closingCents: 10_000_000n, isCurrent: false },
    ]);
    expect(unwrapErr(await s.periods.execute({ box: 'office' }, TEST_OUTSIDER)).type).toBe(
      'Forbidden',
    );
  });
});
