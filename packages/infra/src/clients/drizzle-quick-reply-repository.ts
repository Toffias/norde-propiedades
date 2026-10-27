import {
  QuickReply,
  type QuickReplyId,
  type QuickReplyRepository,
  type QuickReplySnapshot,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { quickReplies } from '../db/schema';

type QuickReplyRow = typeof quickReplies.$inferSelect;

export function toQuickReplySnapshot(row: QuickReplyRow): QuickReplySnapshot {
  const id = parseId<'QuickReply'>(row.id);
  if (id.isErr()) throw new Error(`Invalid quick reply id ${row.id}`);
  return {
    id: id.value,
    name: row.name,
    subject: row.subject ?? undefined,
    body: row.body,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Las respuestas rápidas (`quick_replies`). `automation` (las reglas de envío automático de Tokko)
 * no se usa todavía: queda en `null`.
 */
export class DrizzleQuickReplyRepository implements QuickReplyRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: QuickReplyId): Promise<QuickReply | undefined> {
    const [row] = await this.db.select().from(quickReplies).where(eq(quickReplies.id, id)).limit(1);
    return row && QuickReply.restore(toQuickReplySnapshot(row));
  }

  async save(reply: QuickReply, actorId: string): Promise<void> {
    const s = reply.toSnapshot();
    const values = {
      name: s.name,
      subject: s.subject ?? null,
      body: s.body,
      isActive: s.isActive,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(quickReplies)
      .values({ id: s.id, ...values, createdAt: s.createdAt, createdBy: actorId })
      .onConflictDoUpdate({ target: quickReplies.id, set: values });
  }

  async delete(id: QuickReplyId): Promise<void> {
    await this.db.delete(quickReplies).where(eq(quickReplies.id, id));
  }
}
