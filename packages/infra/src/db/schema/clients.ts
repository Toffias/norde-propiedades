import { sql } from 'drizzle-orm';
import { index, jsonb, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './core-schema';

export const clients = coreSchema.table(
  'clients',
  {
    id: uuid('id').primaryKey(),
    name: text('name'),
    phoneE164: text('phone_e164'),
    /** `Phone.matchKey`: el mismo celular con o sin el 9 da la misma clave. */
    phoneMatchKey: text('phone_match_key'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // La deduplicación también la garantiza la base (dos procesos pueden registrar a la vez).
    uniqueIndex('clients_phone_match_key_uq')
      .on(t.phoneMatchKey)
      .where(sql`phone_match_key is not null`),
    uniqueIndex('clients_email_uq')
      .on(t.email)
      .where(sql`email is not null`),
  ],
);

export const clientChannels = coreSchema.table(
  'client_channels',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    externalId: text('external_id').notNull(),
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }).notNull(),
    lastContactAt: timestamp('last_contact_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.clientId, t.channel, t.externalId] }),
    index('client_channels_identity_idx').on(t.channel, t.externalId),
  ],
);

export const opportunities = coreSchema.table(
  'opportunities',
  {
    id: uuid('id').primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    originChannel: text('origin_channel').notNull(),
    type: text('type').notNull(),
    intent: text('intent').notNull(),
    status: text('status').notNull(),
    /** Propiedad del módulo properties: solo el ID, sin foreign key entre módulos. */
    propertyId: uuid('property_id'),
    search: jsonb('search'),
    notes: jsonb('notes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('opportunities_client_status_idx').on(t.clientId, t.status),
    index('opportunities_status_created_idx').on(t.status, t.createdAt),
  ],
);
