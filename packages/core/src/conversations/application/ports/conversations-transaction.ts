import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { ConversationRepository } from '../../domain/conversation.repository';

import type { MessageLog } from './message-log';

export interface ConversationsTransaction {
  readonly conversations: ConversationRepository;
  readonly messages: MessageLog;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type ConversationsUnitOfWork = UnitOfWork<ConversationsTransaction>;
