import { RecordCashMovement } from '@norde/core/cash';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { createCashUnitOfWork } from '../cash/cash-unit-of-work';
import { auditLog, cashMovements, idempotencyKeys } from '../db/schema';

import { DrizzleIdempotencyKeys } from './drizzle-idempotency-keys';
import { UuidV7IdGenerator } from './uuid-v7-id-generator';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-26T18:00:00Z');
const uow = createCashUnitOfWork(db, { ids, clock });
const record = new RecordCashMovement({ uow, clock, ids });

const CASHIER = Actor.user('00000000-0000-7000-8000-0000000000a1', ['cash:read', 'cash:create']);
const KEY = '0190a5b8-0000-7000-8000-00000000aa01';
const INPUT = {
  box: 'office' as const,
  date: '2026-10-20',
  kind: 'income' as const,
  amount: '1.000',
  concept: 'Seña',
  idempotencyKey: KEY,
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe('idempotency keys', () => {
  it('a retry with the same key records the movement once and replays the result', async () => {
    const first = unwrap(await record.execute(INPUT, CASHIER));
    const retry = unwrap(await record.execute(INPUT, CASHIER));

    expect(retry).toEqual(first);
    expect(await db.select().from(cashMovements)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toHaveLength(1);
    const [stored] = await db.select().from(idempotencyKeys);
    expect(stored).toMatchObject({
      actorId: CASHIER.id,
      command: 'RecordCashMovement',
      key: KEY,
      result: first,
    });
  });

  it('two requests with the same key at the same time record the movement once', async () => {
    const [a, b] = await Promise.all([
      record.execute(INPUT, CASHIER),
      record.execute(INPUT, CASHIER),
    ]);

    expect(unwrap(a)).toEqual(unwrap(b));
    expect(await db.select().from(cashMovements)).toHaveLength(1);
  });

  it('a transaction that fails releases the key', async () => {
    const keys = (executor: typeof db) => new DrizzleIdempotencyKeys(executor, clock);
    const scope = { actorId: CASHIER.id, command: 'RecordCashMovement', key: KEY };

    await expect(
      db.transaction(async (tx) => {
        expect(await keys(tx).claim(scope)).toEqual({ claimed: true });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, KEY))).toEqual([]);
    unwrap(await record.execute(INPUT, CASHIER));
    expect(await db.select().from(cashMovements)).toHaveLength(1);
  });
});
