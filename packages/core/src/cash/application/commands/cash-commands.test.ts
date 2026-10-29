import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  ADMIN_ID,
  CASHIER_ID,
  InMemoryCashUnitOfWork,
  MOVEMENT_ID,
  movementSnapshot,
  TEST_CASH_ADMIN,
  TEST_CASHIER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';

import { CloseCashPeriods } from './close-cash-periods';
import { DeleteCashMovement } from './delete-cash-movement';
import { RecordCashMovement } from './record-cash-movement';
import { UpdateCashMovement } from './update-cash-movement';
import { VoidLastCashMovement } from './void-last-cash-movement';

const OTHER_ID = '00000000-0000-7000-8000-0000000000e2';
const SEPTEMBER_ID = '00000000-0000-7000-8000-0000000000e3';

function setup() {
  const uow = new InMemoryCashUnitOfWork();
  const deps = { uow, clock: new FixedClock(TEST_NOW), ids: new SequentialIdGenerator() };
  return {
    uow,
    record: new RecordCashMovement(deps),
    update: new UpdateCashMovement(deps),
    voidLast: new VoidLastCashMovement(deps),
    remove: new DeleteCashMovement(deps),
    close: new CloseCashPeriods(deps),
  };
}

const INPUT = {
  box: 'office' as const,
  date: '2026-10-20',
  kind: 'income' as const,
  amount: '125.000,50',
  concept: 'Seña',
};

/** Septiembre cerrado con un ingreso de 100.000 y octubre con un egreso de 15.000. */
function withClosedSeptember(s: ReturnType<typeof setup>) {
  s.uow.movements.add(
    movementSnapshot({
      id: SEPTEMBER_ID,
      date: '2026-09-10',
      kind: 'income',
      amountCents: 10_000_000n,
      createdAt: new Date('2026-09-10T15:00:00Z'),
    }),
    movementSnapshot(),
  );
}

describe('RecordCashMovement', () => {
  it('records a movement of the current month and audits its values', async () => {
    const s = setup();

    const { movementId } = unwrap(await s.record.execute(INPUT, TEST_CASHIER));

    expect(s.uow.movements.rows.get(movementId)).toMatchObject({
      amountCents: 12_500_050n,
      createdBy: CASHIER_ID,
      status: 'active',
    });
    expect(s.uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'cash_movement.recorded',
        entityType: 'cash_movement',
        entityId: movementId,
        clientIds: [],
        changes: expect.objectContaining({
          amountCents: { before: null, after: 12_500_050n },
          currency: { before: null, after: 'ARS' },
          concept: { before: null, after: 'Seña' },
        }) as unknown,
      }),
    ]);
    expect(s.uow.closings.rows.size).toBe(0);
  });

  it('needs cash:create', async () => {
    const s = setup();

    expect(unwrapErr(await s.record.execute(INPUT, TEST_OUTSIDER)).type).toBe('Forbidden');
  });

  it('rejects invalid input and future dates', async () => {
    const s = setup();

    expect(
      unwrapErr(await s.record.execute({ ...INPUT, amount: 'mucho' }, TEST_CASHIER)).type,
    ).toBe('InvalidInput');
    expect(
      unwrapErr(await s.record.execute({ ...INPUT, date: '2026-10-27' }, TEST_CASHIER)).type,
    ).toBe('FutureCashDate');
  });

  it('keeps a cashier out of closed months', async () => {
    const s = setup();

    expect(
      unwrapErr(await s.record.execute({ ...INPUT, date: '2026-09-30' }, TEST_CASHIER)),
    ).toEqual({ type: 'CashPeriodClosed', period: '2026-09' });
    expect(s.uow.movements.rows.size).toBe(0);
  });

  it('lets an admin record in a closed month and closes it with the new totals', async () => {
    const s = setup();
    withClosedSeptember(s);
    unwrap(await s.close.execute(undefined, TEST_CASH_ADMIN));

    unwrap(
      await s.record.execute(
        { ...INPUT, date: '2026-09-30', kind: 'expense', amount: '30000' },
        TEST_CASH_ADMIN,
      ),
    );

    expect((await s.uow.closings.findByPeriod('office', '2026-09'))?.toSnapshot()).toMatchObject({
      openingCents: 0n,
      incomeCents: 10_000_000n,
      expenseCents: 3_000_000n,
      closingCents: 7_000_000n,
    });
    expect(s.uow.audit.entries.map((e) => e.action)).toEqual([
      'cash_closing.closed',
      'cash_movement.recorded',
      'cash_closing.recalculated',
    ]);
    expect(s.uow.audit.entries.at(-1)?.changes).toMatchObject({
      expenseCents: { before: 0n, after: 3_000_000n },
      closingCents: { before: 10_000_000n, after: 7_000_000n },
    });
  });
});

describe('UpdateCashMovement', () => {
  const values = {
    movementId: MOVEMENT_ID,
    date: '2026-10-20',
    kind: 'expense' as const,
    amount: 1_500_000n,
    concept: 'Librería',
  };

  it('audits only the fields that changed', async () => {
    const s = setup();
    s.uow.movements.add(movementSnapshot());

    unwrap(await s.update.execute({ ...values, amount: '20.000' }, TEST_CASHIER));

    expect(s.uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'cash_movement.updated',
        changes: { amountCents: { before: 1_500_000n, after: 2_000_000n } },
      }),
    ]);
  });

  it('does not audit an update without changes', async () => {
    const s = setup();
    s.uow.movements.add(movementSnapshot());

    unwrap(await s.update.execute(values, TEST_CASHIER));

    expect(s.uow.audit.entries).toEqual([]);
  });

  it('keeps a cashier from moving a movement to a closed month', async () => {
    const s = setup();
    s.uow.movements.add(movementSnapshot());

    expect(
      unwrapErr(await s.update.execute({ ...values, date: '2026-09-01' }, TEST_CASHIER)).type,
    ).toBe('CashPeriodClosed');
    expect(s.uow.movements.rows.get(MOVEMENT_ID)?.date).toBe('2026-10-20');
  });

  it('keeps a cashier from editing a closed month', async () => {
    const s = setup();
    withClosedSeptember(s);

    expect(
      unwrapErr(
        await s.update.execute(
          { ...values, movementId: SEPTEMBER_ID, date: '2026-09-10' },
          TEST_CASHIER,
        ),
      ).type,
    ).toBe('CashPeriodClosed');
  });

  it('recalculates closings from the oldest month touched', async () => {
    const s = setup();
    withClosedSeptember(s);
    unwrap(await s.close.execute(undefined, TEST_CASH_ADMIN));

    unwrap(await s.update.execute({ ...values, date: '2026-09-15' }, TEST_CASH_ADMIN));

    expect((await s.uow.closings.findByPeriod('office', '2026-09'))?.toSnapshot()).toMatchObject({
      expenseCents: 1_500_000n,
      closingCents: 8_500_000n,
    });
  });

  it('fails for unknown, inactive or forbidden movements', async () => {
    const s = setup();
    s.uow.movements.add(movementSnapshot({ id: OTHER_ID, status: 'voided' }));

    expect(unwrapErr(await s.update.execute(values, TEST_CASHIER)).type).toBe(
      'CashMovementNotFound',
    );
    expect(
      unwrapErr(await s.update.execute({ ...values, movementId: OTHER_ID }, TEST_CASHIER)).type,
    ).toBe('CashMovementInactive');
    expect(unwrapErr(await s.update.execute(values, TEST_OUTSIDER)).type).toBe('Forbidden');
  });
});

describe('VoidLastCashMovement', () => {
  it('voids the last movement of the month and audits it', async () => {
    const s = setup();
    s.uow.movements.add(
      movementSnapshot({ id: OTHER_ID, createdAt: new Date('2026-10-01T12:00:00Z') }),
      movementSnapshot(),
    );

    unwrap(await s.voidLast.execute({ movementId: MOVEMENT_ID }, TEST_CASHIER));

    expect(s.uow.movements.rows.get(MOVEMENT_ID)).toMatchObject({
      status: 'voided',
      voidedBy: CASHIER_ID,
    });
    expect(s.uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'cash_movement.voided',
        entityId: MOVEMENT_ID,
      }),
    ]);
  });

  it('only voids the last one', async () => {
    const s = setup();
    s.uow.movements.add(
      movementSnapshot({ id: OTHER_ID, createdAt: new Date('2026-10-26T18:30:00Z') }),
      movementSnapshot(),
    );

    expect(
      unwrapErr(await s.voidLast.execute({ movementId: MOVEMENT_ID }, TEST_CASHIER)).type,
    ).toBe('NotLastCashMovement');
  });

  it('keeps a cashier out of closed months and needs cash:void', async () => {
    const s = setup();
    withClosedSeptember(s);

    expect(
      unwrapErr(await s.voidLast.execute({ movementId: SEPTEMBER_ID }, TEST_CASHIER)).type,
    ).toBe('CashPeriodClosed');
    expect(
      unwrapErr(await s.voidLast.execute({ movementId: MOVEMENT_ID }, TEST_OUTSIDER)).type,
    ).toBe('Forbidden');
  });

  it('lets an admin void the last one of a closed month', async () => {
    const s = setup();
    withClosedSeptember(s);
    unwrap(await s.close.execute(undefined, TEST_CASH_ADMIN));

    unwrap(await s.voidLast.execute({ movementId: SEPTEMBER_ID }, TEST_CASH_ADMIN));

    expect((await s.uow.closings.findByPeriod('office', '2026-09'))?.toSnapshot()).toMatchObject({
      incomeCents: 0n,
      closingCents: 0n,
    });
  });
});

describe('DeleteCashMovement', () => {
  it('deletes any active movement with cash:delete', async () => {
    const s = setup();
    s.uow.movements.add(
      movementSnapshot(),
      movementSnapshot({ id: OTHER_ID, createdAt: new Date('2026-10-26T18:30:00Z') }),
    );

    unwrap(await s.remove.execute({ movementId: MOVEMENT_ID }, TEST_CASH_ADMIN));

    expect(s.uow.movements.rows.get(MOVEMENT_ID)).toMatchObject({
      status: 'deleted',
      voidedBy: ADMIN_ID,
    });
    expect(s.uow.audit.entries.map((e) => e.action)).toEqual(['cash_movement.deleted']);
    expect(
      unwrapErr(await s.remove.execute({ movementId: MOVEMENT_ID }, TEST_CASH_ADMIN)).type,
    ).toBe('CashMovementInactive');
  });

  it('is not part of the cashier role', async () => {
    const s = setup();
    s.uow.movements.add(movementSnapshot());

    expect(unwrapErr(await s.remove.execute({ movementId: MOVEMENT_ID }, TEST_CASHIER)).type).toBe(
      'Forbidden',
    );
  });
});

describe('CloseCashPeriods', () => {
  it('closes every past month once, with the accumulated opening balance', async () => {
    const s = setup();
    s.uow.movements.add(
      movementSnapshot({ id: SEPTEMBER_ID, date: '2026-07-05', kind: 'income', amountCents: 500n }),
      movementSnapshot(),
    );

    unwrap(await s.close.execute(undefined, TEST_CASHIER));
    unwrap(await s.close.execute(undefined, TEST_CASHIER));

    const closed = [...s.uow.closings.rows.values()].map((c) => c.toSnapshot());
    expect(closed.map((c) => [c.period, c.openingCents, c.closingCents, c.closedBy])).toEqual([
      ['2026-07', 0n, 500n, CASHIER_ID],
      ['2026-08', 500n, 500n, CASHIER_ID],
      ['2026-09', 500n, 500n, CASHIER_ID],
    ]);
    expect(s.uow.audit.entries.filter((e) => e.action === 'cash_closing.closed')).toHaveLength(3);
  });

  it('does nothing for a box without movements and needs cash:read', async () => {
    const s = setup();

    unwrap(await s.close.execute(undefined, TEST_CASHIER));

    expect(s.uow.closings.rows.size).toBe(0);
    expect(unwrapErr(await s.close.execute(undefined, TEST_OUTSIDER)).type).toBe('Forbidden');
  });
});

describe('RecordCashMovement with an idempotency key', () => {
  it('a retry with the same key does not record the movement twice', async () => {
    const s = setup();
    const input = { ...INPUT, idempotencyKey: '0190a5b8-0000-7000-8000-00000000aa01' };

    const first = unwrap(await s.record.execute(input, TEST_CASHIER));
    const retry = unwrap(await s.record.execute(input, TEST_CASHIER));

    expect(retry).toEqual(first);
    expect(s.uow.movements.rows.size).toBe(1);
    expect(s.uow.audit.entries).toHaveLength(1);
  });
});
