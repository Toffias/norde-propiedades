import { sql } from 'drizzle-orm';
import { bigint, date, index, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { authorship, timestamps } from './columns';
import { coreSchema } from './core-schema';

/** Ingresos y egresos de las cajas de la oficina (#164). Anular o borrar no elimina la fila. */
export const cashMovements = coreSchema.table(
  'cash_movements',
  {
    id: uuid('id').primaryKey(),
    /** `office` / `osvaldo`. */
    box: text('box').notNull(),
    /** Día de Buenos Aires. */
    date: date('date', { mode: 'string' }).notNull(),
    /** `AAAA-MM` de `date`: agrupa la planilla y los cierres. */
    period: text('period').notNull(),
    /** `income` / `expense`. */
    kind: text('kind').notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull().default('ARS'),
    concept: text('concept').notNull(),
    notes: text('notes'),
    /** `active` / `voided` / `deleted`. Solo los activos suman al saldo. */
    status: text('status').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: text('voided_by'),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [
    // Planilla del mes (orden de fecha y de carga) y sumas de los meses anteriores.
    index('cash_movements_box_period_idx')
      .on(t.box, t.period, t.date, t.createdAt, t.id)
      .where(sql`status = 'active'`),
    // Último cargado del mes: el que se puede anular.
    index('cash_movements_box_period_created_idx')
      .on(t.box, t.period, t.createdAt)
      .where(sql`status = 'active'`),
    // Primer mes de la caja, para los cierres.
    index('cash_movements_box_all_period_idx').on(t.box, t.period),
  ],
);

/**
 * Foto de cada mes de cada caja al cerrarse. Se recalcula si cambia un mes cerrado. El alta
 * (`created_at`, `created_by`) es el cierre.
 */
export const cashClosings = coreSchema.table(
  'cash_closings',
  {
    id: uuid('id').primaryKey(),
    box: text('box').notNull(),
    period: text('period').notNull(),
    openingCents: bigint('opening_cents', { mode: 'bigint' }).notNull(),
    incomeCents: bigint('income_cents', { mode: 'bigint' }).notNull(),
    expenseCents: bigint('expense_cents', { mode: 'bigint' }).notNull(),
    closingCents: bigint('closing_cents', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull().default('ARS'),
    ...timestamps(),
    ...authorship(),
  },
  (t) => [uniqueIndex('cash_closings_box_period_uq').on(t.box, t.period)],
);
