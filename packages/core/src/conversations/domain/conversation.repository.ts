import type { Conversation, ConversationChannel, ConversationId } from './conversation';

export interface ConversationRepository {
  findById(id: ConversationId): Promise<Conversation | undefined>;
  findByChannelIdentity(
    channel: ConversationChannel,
    externalId: string,
  ): Promise<Conversation | undefined>;
  save(conversation: Conversation): Promise<void>;
}
