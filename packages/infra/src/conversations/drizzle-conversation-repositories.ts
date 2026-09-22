import {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUSES,
  Conversation,
  type ConversationChannel,
  type ConversationId,
  type ConversationRepository,
  type InboundMessageEntry,
  type MessageLog,
  type OutboundMessageEntry,
} from '@norde/core/conversations';
import { parseId } from '@norde/core/shared';
import { and, count, eq, gt, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { fromJsonb, toJsonb } from '../db/json';
import { conversationMessages, conversations } from '../db/schema';

const RowSchema = z.object({
  channel: z.enum(CONVERSATION_CHANNELS),
  status: z.enum(CONVERSATION_STATUSES),
  agentMemory: z.array(z.unknown()),
});

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: ConversationId) {
    return this.findOneWhere(eq(conversations.id, id));
  }

  findByChannelIdentity(channel: ConversationChannel, externalId: string) {
    return this.findOneWhere(
      and(eq(conversations.channel, channel), eq(conversations.externalId, externalId)),
    );
  }

  async save(conversation: Conversation): Promise<void> {
    const s = conversation.toSnapshot();
    const row = {
      id: s.id,
      channel: s.channel,
      externalId: s.externalId,
      contactName: s.contactName ?? null,
      clientId: s.clientId ?? null,
      status: s.status,
      agentMemory: toJsonb(s.agentMemory),
      searchCriteria: s.searchCriteria === undefined ? null : toJsonb(s.searchCriteria),
      startedAt: s.startedAt,
      lastActivityAt: s.lastActivityAt,
    };
    await this.db
      .insert(conversations)
      .values(row)
      .onConflictDoUpdate({
        target: conversations.id,
        set: {
          contactName: row.contactName,
          clientId: row.clientId,
          status: row.status,
          agentMemory: row.agentMemory,
          searchCriteria: row.searchCriteria,
          lastActivityAt: row.lastActivityAt,
        },
      });
  }

  private async findOneWhere(where: SQL | undefined): Promise<Conversation | undefined> {
    const [row] = await this.db.select().from(conversations).where(where).limit(1);
    if (!row) return undefined;

    const id = parseId<'Conversation'>(row.id);
    if (id.isErr()) throw new Error(`Invalid conversation id stored: ${row.id}`);
    const parsed = RowSchema.parse(row);
    return Conversation.restore({
      id: id.value,
      channel: parsed.channel,
      externalId: row.externalId,
      contactName: row.contactName ?? undefined,
      clientId: row.clientId ?? undefined,
      status: parsed.status,
      agentMemory: parsed.agentMemory,
      searchCriteria: row.searchCriteria === null ? undefined : fromJsonb(row.searchCriteria),
      startedAt: row.startedAt,
      lastActivityAt: row.lastActivityAt,
    });
  }
}

export class DrizzleMessageLog implements MessageLog {
  constructor(private readonly db: DbExecutor) {}

  async appendInbound(entry: InboundMessageEntry): Promise<boolean> {
    const inserted = await this.db
      .insert(conversationMessages)
      .values({
        id: entry.id,
        conversationId: entry.conversationId,
        direction: 'in',
        channel: entry.channel,
        channelMessageId: entry.channelMessageId,
        kind: entry.kind,
        body: toJsonb(entry.body),
        sentAt: entry.sentAt,
        recordedAt: entry.recordedAt,
      })
      // La reentrega del canal choca con el índice único y no se inserta.
      .onConflictDoNothing()
      .returning({ id: conversationMessages.id });
    return inserted.length > 0;
  }

  async appendOutbound(entry: OutboundMessageEntry): Promise<void> {
    await this.db.insert(conversationMessages).values({
      id: entry.id,
      conversationId: entry.conversationId,
      direction: 'out',
      channel: entry.channel,
      channelMessageId: entry.channelMessageId ?? null,
      kind: entry.kind,
      body: toJsonb(entry.body),
      recordedAt: entry.recordedAt,
    });
  }

  async countInboundSince(conversationId: ConversationId, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.conversationId, conversationId),
          eq(conversationMessages.direction, 'in'),
          gt(conversationMessages.recordedAt, since),
        ),
      );
    return row?.n ?? 0;
  }

  async countOutboundSince(channel: ConversationChannel, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(conversationMessages)
      .where(
        and(
          eq(conversationMessages.channel, channel),
          eq(conversationMessages.direction, 'out'),
          gt(conversationMessages.recordedAt, since),
        ),
      );
    return row?.n ?? 0;
  }
}
