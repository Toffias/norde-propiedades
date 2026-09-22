import type { ConversationChannel, ConversationId } from '../../domain/conversation';

export interface InboundMessageEntry {
  readonly id: string;
  readonly conversationId: ConversationId;
  readonly channel: ConversationChannel;
  readonly channelMessageId: string;
  readonly kind: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly sentAt: Date;
  readonly recordedAt: Date;
}

export interface OutboundMessageEntry {
  readonly id: string;
  readonly conversationId: ConversationId;
  readonly channel: ConversationChannel;
  readonly channelMessageId: string | undefined;
  readonly kind: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly recordedAt: Date;
}

/** Registro de mensajes de las conversaciones (solo se agrega). También es la base de los topes. */
export interface MessageLog {
  /** Devuelve `false` si ese mensaje del canal ya estaba registrado (reentrega). */
  appendInbound(entry: InboundMessageEntry): Promise<boolean>;
  appendOutbound(entry: OutboundMessageEntry): Promise<void>;
  countInboundSince(conversationId: ConversationId, since: Date): Promise<number>;
  countOutboundSince(channel: ConversationChannel, since: Date): Promise<number>;
}
