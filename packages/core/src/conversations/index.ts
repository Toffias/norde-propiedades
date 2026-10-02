// API pública del módulo conversations (`@norde/core/conversations`).

export * from './contracts';
export {
  CONVERSATION_CHANNELS,
  CONVERSATION_STATUSES,
  Conversation,
  type AgentMemory,
  type ConversationChannel,
  type ConversationId,
  type ConversationSnapshot,
  type ConversationStatus,
} from './domain/conversation';
export type { ConversationEvent } from './domain/conversation.events';
export type { ConversationRepository } from './domain/conversation.repository';
export type { UsageLimits } from './domain/reply-policy';
export type { ConversationPolicy } from './application/conversation-policy';
export type {
  ChannelMessenger,
  ChannelMessengers,
  DeliveryFailedError,
} from './application/ports/channel-messenger';
export type {
  ConversationsTransaction,
  ConversationsUnitOfWork,
} from './application/ports/conversations-transaction';
export type {
  InboundMessageEntry,
  MessageLog,
  OutboundMessageEntry,
} from './application/ports/message-log';
export {
  ReceiveInboundMessages,
  type ReceiveInboundMessagesError,
} from './application/commands/receive-inbound-messages';
export { SendReply, type SendReplyError } from './application/commands/send-reply';
export {
  EraseClientConversations,
  type EraseClientConversationsError,
} from './application/handlers/erase-client-conversations';
export type { ClientConversationErasure } from './application/ports/client-conversation-erasure';
