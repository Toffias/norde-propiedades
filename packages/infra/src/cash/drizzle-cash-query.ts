import {
  CASH_MOVEMENT_KINDS,
  type CashMovementListItem,
  type CashPeriodRow,
  type CashQuery,
} from '@norde/core/cash';
import type { PageSlice } from '@norde/core/shared';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { cashClosings, cashMovements } from '../db/schema';

const MovementRow = z.object({
  id: z.string(),
  date: z.string(),
  kind: z.enum(CASH_MOVEMENT_KINDS),
  amount_cents: z.coerce.bigint(),
  concept: z.string(),
  notes: z.string().nullable(),
  balance_cents: z.coerce.bigint(),
  created_at: z.coerce.date(),
  created_by: z.string(),
});
const PeriodRow = z.object({
  period: z.string(),
  closing_cents: z.coerce.bigint().nullable(),
});
const CountRow = z.object({ total: z.coerce.number() });

/** Planilla de la caja: el saldo de cada fila se calcula en la base con una suma acumulada. */
export class DrizzleCashQuery implements CashQuery {
  constructor(private readonly db: DbExecutor) {}

  async movements(
    params: Parameters<CashQuery['movements']>[0],
  ): Promise<PageSlice<CashMovementListItem>> {
    const m = cashMovements;
    const signed = sql`case when ${m.kind} = 'income' then ${m.amountCents} else -${m.amountCents} end`;
    const active = sql`${m.box} = ${params.box} and ${m.status} = 'active'`;
    const order = params.sort.direction === 'asc' ? sql`asc` : sql`desc`;
    const rows = await this.db.execute(sql`
      with opening as (
        select coalesce(sum(${signed}), 0) as cents
        from ${m}
        where ${active} and ${m.period} < ${params.period}
      ),
      sheet as (
        select ${m.id} as id, ${m.date}::text as date, ${m.kind} as kind,
          ${m.amountCents} as amount_cents, ${m.concept} as concept, ${m.notes} as notes,
          ${m.createdAt} as created_at, ${m.createdBy} as created_by,
          sum(${signed}) over (order by ${m.date}, ${m.createdAt}, ${m.id}) as running_cents
        from ${m}
        where ${active} and ${m.period} = ${params.period}
      )
      select sheet.id, sheet.date, sheet.kind, sheet.amount_cents, sheet.concept, sheet.notes,
        sheet.created_at, sheet.created_by, opening.cents + sheet.running_cents as balance_cents
      from sheet, opening
      order by sheet.date ${order}, sheet.created_at ${order}, sheet.id ${order}
      limit ${params.limit} offset ${params.offset}
    `);
    const totals = await this.db.execute(sql`
      select count(*) as total from ${m} where ${active} and ${m.period} = ${params.period}
    `);
    return {
      items: rows.rows.map((raw) => {
        const row = MovementRow.parse(raw);
        return {
          id: row.id,
          date: row.date,
          kind: row.kind,
          amountCents: row.amount_cents,
          concept: row.concept,
          notes: row.notes ?? undefined,
          balanceCents: row.balance_cents,
          createdAt: row.created_at,
          createdBy: row.created_by,
        };
      }),
      total: CountRow.parse(totals.rows[0] ?? { total: 0 }).total,
    };
  }

  async periods(params: Parameters<CashQuery['periods']>[0]): Promise<PageSlice<CashPeriodRow>> {
    const c = cashClosings;
    const all = sql`
      select ${c.period} as period, ${c.closingCents} as closing_cents
      from ${c}
      where ${c.box} = ${params.box} and ${c.period} < ${params.current}
      union all
      select ${params.current}::text as period, null::bigint as closing_cents
    `;
    const order = params.sort.direction === 'asc' ? sql`asc` : sql`desc`;
    const rows = await this.db.execute(sql`
      select period, closing_cents from (${all}) p
      order by period ${order}
      limit ${params.limit} offset ${params.offset}
    `);
    const totals = await this.db.execute(sql`select count(*) as total from (${all}) p`);
    return {
      items: rows.rows.map((raw) => {
        const row = PeriodRow.parse(raw);
        return {
          period: row.period,
          closingCents: row.closing_cents ?? undefined,
          isCurrent: row.period === params.current,
        };
      }),
      total: CountRow.parse(totals.rows[0] ?? { total: 0 }).total,
    };
  }
}
