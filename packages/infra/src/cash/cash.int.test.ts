import {
  CloseCashPeriods,
  GetCashPeriod,
  ListCashMovements,
  ListCashPeriods,
  RecordCashMovement,
  UpdateCashMovement,
  VoidLastCashMovement,
  type CashUserNames,
  type RecordCashMovementInput,
} from '@norde/core/cash';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, cashClosings, cashMovements } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createCashUnitOfWork } from './cash-unit-of-work';
import { DrizzleCashQuery } from './drizzle-cash-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
/** 26/10/2026 a las 15 de Buenos Aires. */
const clock = new FixedClock('2026-10-26T18:00:00Z');
const uow = createCashUnitOfWork(db, { ids, clock });
const query = new DrizzleCashQuery(db);
const users: CashUserNames = { names: () => Promise.resolve(new Map()) };

const deps = { uow, clock, ids };
const record = new RecordCashMovement(deps);
const update = new UpdateCashMovement(deps);
const voidLast = new VoidLastCashMovement(deps);
const close = new CloseCashPeriods(deps);
const getPeriod = new GetCashPeriod({ uow, clock });
const list = new ListCashMovements({ cash: query, users, clock });
const periods = new ListCashPeriods({ cash: query, clock });

const CASHIER = Actor.user('00000000-0000-7000-8000-0000000000a1', [
  'cash:read',
  'cash:create',
  'cash:update',
  'cash:void',
]);
const ADMIN = Actor.user('00000000-0000-7000-8000-0000000000a2', ['cash:*']);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aMovement(
  input: Partial<RecordCashMovementInput> = {},
  actor: Actor = ADMIN,
): Promise<string> {
  const { movementId } = unwrap(
    await record.execute(
      {
        box: 'office',
        date: '2026-10-05',
        kind: 'income',
        amount: '1000',
        concept: 'Movimiento',
        ...input,
      },
      actor,
    ),
  );
  return movementId;
}

describe('cash (Postgres)', () => {
  it('records a movement in cents with its audit entry', async () => {
    const id = await aMovement({ amount: '125.000,50', notes: 'Recibo 12' }, CASHIER);

    const [row] = await db.select().from(cashMovements).where(eq(cashMovements.id, id));
    expect(row).toMatchObject({
      box: 'office',
      date: '2026-10-05',
      period: '2026-10',
      kind: 'income',
      amountCents: 12_500_050n,
      currency: 'ARS',
      status: 'active',
      createdBy: CASHIER.id,
    });
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(entries.map((e) => e.action)).toEqual(['cash_movement.recorded']);
  });

  it('pages the month with the running balance, without losing or repeating rows', async () => {
    await aMovement({ date: '2026-09-10', amount: '500' });
    await aMovement({ box: 'osvaldo', amount: '99999' });
    for (let day = 1; day <= 7; day++) {
      await aMovement({
        date: `2026-10-0${String(8 - day)}`,
        kind: day % 2 === 0 ? 'expense' : 'income',
        amount: String(day * 100),
      });
    }

    const pages = [];
    for (let page = 1; page <= 3; page++) {
      pages.push(unwrap(await list.execute({ box: 'office', page, pageSize: 3 }, CASHIER)).items);
    }
    const rows = pages.flat();

    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.id)).size).toBe(7);
    expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort());
    // 500 de septiembre + los movimientos del día 1 al 7 de octubre (el día 7 es el primero cargado).
    let balance = 50_000n;
    for (const row of rows) {
      balance += row.kind === 'income' ? row.amountCents : -row.amountCents;
      expect(row.balanceCents).toBe(balance);
    }

    const newest = unwrap(
      await list.execute({ box: 'office', sort: '-date', pageSize: 1 }, CASHIER),
    );
    expect(newest.total).toBe(7);
    expect(newest.items[0]?.balanceCents).toBe(balance);
  });

  it('closes past months once and recalculates them when an admin changes one', async () => {
    const september = await aMovement({ date: '2026-08-20', amount: '1000' });
    await aMovement({ date: '2026-10-05', kind: 'expense', amount: '300' });

    unwrap(await close.execute(undefined, CASHIER));
    unwrap(await close.execute(undefined, CASHIER));

    const closed = await db.select().from(cashClosings).orderBy(cashClosings.period);
    expect(closed.map((c) => [c.period, c.openingCents, c.closingCents])).toEqual([
      ['2026-08', 0n, 100_000n],
      ['2026-09', 100_000n, 100_000n],
    ]);

    unwrap(
      await update.execute(
        {
          movementId: september,
          date: '2026-08-20',
          kind: 'income',
          amount: '1500',
          concept: 'Movimiento',
        },
        ADMIN,
      ),
    );

    const recalculated = await db.select().from(cashClosings).orderBy(cashClosings.period);
    expect(recalculated.map((c) => [c.period, c.openingCents, c.closingCents])).toEqual([
      ['2026-08', 0n, 150_000n],
      ['2026-09', 150_000n, 150_000n],
    ]);
    expect(recalculated.every((c) => c.updatedBy === ADMIN.id)).toBe(true);

    const summary = unwrap(await getPeriod.execute({ box: 'office' }, CASHIER));
    expect(summary).toMatchObject({
      openingCents: 150_000n,
      expenseCents: 30_000n,
      closingCents: 120_000n,
    });

    const months = unwrap(await periods.execute({ box: 'office' }, CASHIER));
    expect(months.items.map((p) => [p.period, p.closingCents, p.isCurrent])).toEqual([
      ['2026-10', undefined, true],
      ['2026-09', 150_000n, false],
      ['2026-08', 150_000n, false],
    ]);
  });

  it('voids only the last movement loaded in the month', async () => {
    const first = await aMovement({ date: '2026-10-20' }, CASHIER);
    const last = await aMovement({ date: '2026-10-01' }, CASHIER);

    const notLast = await voidLast.execute({ movementId: first }, CASHIER);
    expect(notLast.isErr() && notLast.error.type).toBe('NotLastCashMovement');
    unwrap(await voidLast.execute({ movementId: last }, CASHIER));

    const summary = unwrap(await getPeriod.execute({ box: 'office' }, CASHIER));
    expect(summary.incomeCents).toBe(100_000n);
    expect(summary.lastMovementId).toBe(first);
    const [row] = await db.select().from(cashMovements).where(eq(cashMovements.id, last));
    expect(row).toMatchObject({ status: 'voided', voidedBy: CASHIER.id });
  });
});
