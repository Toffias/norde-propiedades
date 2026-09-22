import { sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './core-schema';

export const conversations = coreSchema.table(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    channel: text('channel').notNull(),
    /** Teléfono en WhatsApp, ID de sesión en el web chat. */
    externalId: text('external_id').notNull(),
    contactName: text('contact_name'),
    /** Cliente del módulo clients: solo el ID, sin foreign key entre módulos. */
    clientId: uuid('client_id'),
    status: text('status').notNull(),
    /** Ítems del historial del agente (OpenAI Agents SDK), opacos para el core. */
    agentMemory: jsonb('agent_memory')
      .notNull()
      .default(sql`'[]'::jsonb`),
    searchCriteria: jsonb('search_criteria'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('conversations_identity_uq').on(t.channel, t.externalId),
    index('conversations_last_activity_idx').on(t.lastActivityAt),
    index('conversations_client_idx').on(t.clientId),
  ],
);

export const conversationMessages = coreSchema.table(
  'conversation_messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    channel: text('channel').notNull(),
    /** ID del mensaje en el canal (wamid). Clave de idempotencia de los entrantes. */
    channelMessageId: text('channel_message_id'),
    kind: text('kind').notNull(),
    body: jsonb('body').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('conversation_messages_channel_message_uq')
      .on(t.channel, t.direction, t.channelMessageId)
      .where(sql`channel_message_id is not null`),
    index('conversation_messages_conversation_idx').on(t.conversationId, t.recordedAt),
    // Topes de uso: conteo de entrantes por conversación y de salientes por canal.
    index('conversation_messages_usage_idx').on(t.channel, t.direction, t.recordedAt),
  ],
);
