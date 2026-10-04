import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { ConversationRepository } from '../../domain/conversation.repository';

import type { ClientConversationMerge } from './client-conversation-merge';
import type { MessageLog } from './message-log';

export interface ConversationsTransaction {
  readonly conversations: ConversationRepository;
  readonly messages: MessageLog;
  readonly clientMerge: ClientConversationMerge;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type ConversationsUnitOfWork = UnitOfWork<ConversationsTransaction>;
