import { sql } from 'drizzle-orm';
import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './core-schema';

/**
 * Outbox de eventos de dominio: se escriben en la misma transacción que el cambio y un relay
 * los publica en pg-boss. Así no se pierde un evento si el proceso se cae.
 */
export const outbox = coreSchema.table(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    eventType: text('event_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('outbox_pending_idx')
      .on(t.recordedAt)
      .where(sql`published_at is null`),
  ],
);

/** Trazabilidad: quién hizo qué, cuándo y sobre qué entidad (módulo audit). */
export const auditLog = coreSchema.table(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    changes: jsonb('changes'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
    index('audit_log_occurred_idx').on(t.occurredAt),
  ],
);
