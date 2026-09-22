import type { ConversationsTransaction, ConversationsUnitOfWork } from '@norde/core/conversations';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzleConversationRepository,
  DrizzleMessageLog,
} from './drizzle-conversation-repositories';

export function createConversationsUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): ConversationsUnitOfWork {
  return new DrizzleUnitOfWork<ConversationsTransaction>(db, (tx) => ({
    conversations: new DrizzleConversationRepository(tx),
    messages: new DrizzleMessageLog(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
