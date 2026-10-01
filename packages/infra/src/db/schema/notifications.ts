import {
  boolean,
  index,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns';
import { coreSchema } from './core-schema';

/** Notificaciones a usuarios del panel. Las crean handlers de eventos de dominio. */
export const notifications = coreSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    entityType: text('entity_type'),
    /** Entidad de otro módulo: solo el ID, sin foreign key entre módulos. */
    entityId: uuid('entity_id'),
    link: text('link'),
    /** Evento del outbox que la originó (idempotencia del handler). */
    sourceEventId: uuid('source_event_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('notifications_user_read_created_idx').on(t.userId, t.readAt, t.createdAt.desc()),
    index('notifications_user_pinned_idx').on(t.userId, t.pinnedAt),
    uniqueIndex('notifications_source_event_user_uq').on(t.sourceEventId, t.userId),
    index('notifications_entity_idx').on(t.entityType, t.entityId),
  ],
);

/** Preferencias por tipo de notificación. Sin fila: valores por defecto del tipo. */
export const notificationPreferences = coreSchema.table(
  'notification_preferences',
  {
    /** Usuario del módulo identity: solo el ID, sin foreign key entre módulos. */
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(false),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);
