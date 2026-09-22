import type { DomainEvent } from '../../shared/domain/domain-event';

export type ConversationStarted = DomainEvent<
  'conversations.conversation_started',
  { readonly conversationId: string; readonly channel: string }
>;

export type ConversationLinkedToClient = DomainEvent<
  'conversations.conversation_linked_to_client',
  { readonly conversationId: string; readonly clientId: string }
>;

export type ConversationHandedOff = DomainEvent<
  'conversations.conversation_handed_off',
  { readonly conversationId: string }
>;

export type ConversationReturnedToBot = DomainEvent<
  'conversations.conversation_returned_to_bot',
  { readonly conversationId: string }
>;

export type ConversationEvent =
  | ConversationStarted
  | ConversationLinkedToClient
  | ConversationHandedOff
  | ConversationReturnedToBot;
