import type { ClientConversationMerge } from '@norde/core/conversations';
import { eq } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { conversations } from '../db/schema';

/** Unificación: las conversaciones del duplicado pasan al contacto que queda (los mensajes, con ellas). */
export class DrizzleClientConversationMerge implements ClientConversationMerge {
  constructor(private readonly db: DbExecutor) {}

  async moveClient(fromClientId: string, toClientId: string): Promise<readonly string[]> {
    const moved = await this.db
      .update(conversations)
      .set({ clientId: toClientId })
      .where(eq(conversations.clientId, fromClientId))
      .returning({ id: conversations.id });
    return moved.map((row) => row.id);
  }
}
