import type { ClientConversationErasure } from '@norde/core/conversations';
import { inArray } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { conversations } from '../db/schema';

/** Supresión: las conversaciones de los clientes suprimidos; los mensajes caen en cascada. */
export class DrizzleClientConversationErasure implements ClientConversationErasure {
  constructor(private readonly db: DbExecutor) {}

  async eraseForClients(clientIds: readonly string[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const erased = await this.db
      .delete(conversations)
      .where(inArray(conversations.clientId, [...clientIds]))
      .returning({ id: conversations.id });
    return erased.length;
  }
}
