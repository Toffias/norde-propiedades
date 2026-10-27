import {
  CASH_BOXES,
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_STATUSES,
  CashClosing,
  CashMovement,
  type CashBox,
  type CashClosingRepository,
  type CashLedger,
  type CashMovementId,
  type CashMovementRepository,
  type CashPeriod,
  type CashTotals,
} from '@norde/core/cash';
import { parseId } from '@norde/core/shared';
import { and, desc, eq, lt, max, min, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { cashClosings, cashMovements } from '../db/schema';

type MovementRow = typeof cashMovements.$inferSelect;
type ClosingRow = typeof cashClosings.$inferSelect;

const BoxSchema = z.enum(CASH_BOXES);
const KindSchema = z.enum(CASH_MOVEMENT_KINDS);
const StatusSchema = z.enum(CASH_MOVEMENT_STATUSES);
/** Las sumas de `bigint` vuelven como texto (`numeric` de Postgres). */
const TotalsSchema = z.object({
  openingCents: z.coerce.bigint(),
  incomeCents: z.coerce.bigint(),
  expenseCents: z.coerce.bigint(),
});

function toId<TBrand extends string>(raw: string) {
  const id = parseId<TBrand>(raw);
  if (id.isErr()) throw new Error(`Invalid cash id ${raw}`);
  return id.value;
}

function toMovement(row: MovementRow): CashMovement {
  return CashMovement.restore({
    id: toId<'CashMovement'>(row.id),
    box: BoxSchema.parse(row.box),
    date: row.date,
    kind: KindSchema.parse(row.kind),
    amountCents: row.amountCents,
    concept: row.concept,
    notes: row.notes ?? undefined,
    status: StatusSchema.parse(row.status),
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt,
    voidedAt: row.voidedAt ?? undefined,
    voidedBy: row.voidedBy ?? undefined,
  });
}

function toClosing(row: ClosingRow): CashClosing {
  return CashClosing.restore({
    id: toId<'CashClosing'>(row.id),
    box: BoxSchema.parse(row.box),
    period: row.period,
    openingCents: row.openingCents,
    incomeCents: row.incomeCents,
    expenseCents: row.expenseCents,
    closingCents: row.closingCents,
    closedAt: row.createdAt,
    closedBy: row.createdBy,
    updatedAt: row.updatedAt,
  });
}

/** Lo que cambia de un movimiento: todo menos la caja y el alta. */
function changingValues(movement: CashMovement, actorId: string) {
  const s = movement.toSnapshot();
  return {
    date: s.date,
    period: movement.period,
    kind: s.kind,
    amountCents: s.amountCents,
    concept: s.concept,
    notes: s.notes ?? null,
    status: s.status,
    voidedAt: s.voidedAt ?? null,
    voidedBy: s.voidedBy ?? null,
    updatedAt: s.updatedAt,
    updatedBy: actorId,
  };
}

export class DrizzleCashMovementRepository implements CashMovementRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: CashMovementId): Promise<CashMovement | undefined> {
    const [row] = await this.db.select().from(cashMovements).where(eq(cashMovements.id, id));
    return row === undefined ? undefined : toMovement(row);
  }

  async findLastActive(box: CashBox, period: CashPeriod): Promise<CashMovement | undefined> {
    const [row] = await this.db
      .select()
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.box, box),
          eq(cashMovements.period, period),
          eq(cashMovements.status, 'active'),
        ),
      )
      .orderBy(desc(cashMovements.createdAt), desc(cashMovements.id))
      .limit(1);
    return row === undefined ? undefined : toMovement(row);
  }

  async insert(movement: CashMovement, actorId: string): Promise<void> {
    const s = movement.toSnapshot();
    await this.db.insert(cashMovements).values({
      id: s.id,
      box: s.box,
      ...changingValues(movement, actorId),
      createdAt: s.createdAt,
      createdBy: actorId,
    });
  }

  async save(movement: CashMovement, actorId: string): Promise<void> {
    await this.db
      .update(cashMovements)
      .set(changingValues(movement, actorId))
      .where(eq(cashMovements.id, movement.id));
  }
}

export class DrizzleCashClosingRepository implements CashClosingRepository {
  constructor(private readonly db: DbExecutor) {}

  async findByPeriod(box: CashBox, period: CashPeriod): Promise<CashClosing | undefined> {
    const [row] = await this.db
      .select()
      .from(cashClosings)
      .where(and(eq(cashClosings.box, box), eq(cashClosings.period, period)));
    return row === undefined ? undefined : toClosing(row);
  }

  async lastPeriod(box: CashBox): Promise<CashPeriod | undefined> {
    const [row] = await this.db
      .select({ period: max(cashClosings.period) })
      .from(cashClosings)
      .where(eq(cashClosings.box, box));
    return row?.period ?? undefined;
  }

  async insertIfMissing(closing: CashClosing): Promise<boolean> {
    const s = closing.toSnapshot();
    const inserted = await this.db
      .insert(cashClosings)
      .values({
        id: s.id,
        box: s.box,
        period: s.period,
        openingCents: s.openingCents,
        incomeCents: s.incomeCents,
        expenseCents: s.expenseCents,
        closingCents: s.closingCents,
        createdAt: s.closedAt,
        updatedAt: s.updatedAt,
        createdBy: s.closedBy,
        updatedBy: s.closedBy,
      })
      .onConflictDoNothing({ target: [cashClosings.box, cashClosings.period] })
      .returning({ id: cashClosings.id });
    return inserted.length > 0;
  }

  async save(closing: CashClosing, actorId: string): Promise<void> {
    const s = closing.toSnapshot();
    await this.db
      .update(cashClosings)
      .set({
        openingCents: s.openingCents,
        incomeCents: s.incomeCents,
        expenseCents: s.expenseCents,
        closingCents: s.closingCents,
        updatedAt: s.updatedAt,
        updatedBy: actorId,
      })
      .where(eq(cashClosings.id, s.id));
  }
}

export class DrizzleCashLedger implements CashLedger {
  constructor(private readonly db: DbExecutor) {}

  async firstPeriod(box: CashBox): Promise<CashPeriod | undefined> {
    const [row] = await this.db
      .select({ period: min(cashMovements.period) })
      .from(cashMovements)
      .where(eq(cashMovements.box, box));
    return row?.period ?? undefined;
  }

  async totals(box: CashBox, period: CashPeriod): Promise<CashTotals> {
    const m = cashMovements;
    const signed = sql`case when ${m.kind} = 'income' then ${m.amountCents} else -${m.amountCents} end`;
    const [row] = await this.db
      .select({
        openingCents: sql`coalesce(sum(${signed}) filter (where ${lt(m.period, period)}), 0)`,
        incomeCents: sql`coalesce(sum(${m.amountCents}) filter (where ${m.period} = ${period} and ${m.kind} = 'income'), 0)`,
        expenseCents: sql`coalesce(sum(${m.amountCents}) filter (where ${m.period} = ${period} and ${m.kind} = 'expense'), 0)`,
      })
      .from(m)
      .where(and(eq(m.box, box), eq(m.status, 'active'), sql`${m.period} <= ${period}`));
    return TotalsSchema.parse(row);
  }
}
