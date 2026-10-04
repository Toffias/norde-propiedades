// Fakes del módulo conversations para tests (`@norde/core/conversations/testing`).

import { err, ok, type Result } from '../../shared';
import { InMemoryAuditLog, InMemoryEventPublisher } from '../../shared/testing';
import type { OutboundMessage } from '../contracts';
import type { ChannelMessenger, DeliveryFailedError } from '../application/ports/channel-messenger';
import type { ClientConversationMerge } from '../application/ports/client-conversation-merge';
import type {
  ConversationsTransaction,
  ConversationsUnitOfWork,
} from '../application/ports/conversations-transaction';
import type {
  InboundMessageEntry,
  MessageLog,
  OutboundMessageEntry,
} from '../application/ports/message-log';
import {
  Conversation,
  type ConversationChannel,
  type ConversationId,
  type ConversationSnapshot,
} from '../domain/conversation';
import type { ConversationRepository } from '../domain/conversation.repository';

export class InMemoryConversationRepository implements ConversationRepository {
  readonly rows = new Map<string, ConversationSnapshot>();

  findById(id: ConversationId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Conversation.restore(row));
  }

  findByChannelIdentity(channel: ConversationChannel, externalId: string) {
    const row = [...this.rows.values()].find(
      (r) => r.channel === channel && r.externalId === externalId,
    );
    return Promise.resolve(row && Conversation.restore(row));
  }

  save(conversation: Conversation) {
    this.rows.set(conversation.id, conversation.toSnapshot());
    return Promise.resolve();
  }
}

export class InMemoryMessageLog implements MessageLog {
  readonly inbound: InboundMessageEntry[] = [];
  readonly outbound: OutboundMessageEntry[] = [];

  appendInbound(entry: InboundMessageEntry) {
    const duplicate = this.inbound.some(
      (e) => e.channel === entry.channel && e.channelMessageId === entry.channelMessageId,
    );
    if (!duplicate) this.inbound.push(entry);
    return Promise.resolve(!duplicate);
  }

  appendOutbound(entry: OutboundMessageEntry) {
    this.outbound.push(entry);
    return Promise.resolve();
  }

  countInboundSince(conversationId: ConversationId, since: Date) {
    return Promise.resolve(
      this.inbound.filter((e) => e.conversationId === conversationId && e.recordedAt > since)
        .length,
    );
  }

  countOutboundSince(channel: ConversationChannel, since: Date) {
    return Promise.resolve(
      this.outbound.filter((e) => e.channel === channel && e.recordedAt > since).length,
    );
  }
}

/** Unidad de trabajo en memoria, con rollback ante un `Err` o una excepción. */
export class InMemoryConversationsUnitOfWork implements ConversationsUnitOfWork {
  readonly conversations = new InMemoryConversationRepository();
  readonly messages = new InMemoryMessageLog();
  readonly clientMerge = new FakeClientConversationMerge();
  readonly events = new InMemoryEventPublisher();
  readonly audit = new InMemoryAuditLog();

  async run<T>(work: (tx: ConversationsTransaction) => Promise<T>): Promise<T> {
    const backup = {
      conversations: new Map(this.conversations.rows),
      inbound: this.messages.inbound.length,
      outbound: this.messages.outbound.length,
      events: this.events.published.length,
      audit: this.audit.entries.length,
    };
    const rollback = () => {
      this.conversations.rows.clear();
      for (const [k, v] of backup.conversations) this.conversations.rows.set(k, v);
      this.messages.inbound.splice(backup.inbound);
      this.messages.outbound.splice(backup.outbound);
      this.events.published.splice(backup.events);
      this.audit.entries.splice(backup.audit);
    };

    try {
      const result = await work(this);
      if (typeof result === 'object' && result !== null && 'ok' in result && !result.ok) {
        rollback();
      }
      return result;
    } catch (error) {
      rollback();
      throw error;
    }
  }
}

/** Mensajero que registra lo enviado. `failWith` simula un rechazo del canal. */
export class RecordingMessenger implements ChannelMessenger {
  readonly sent: { readonly to: string; readonly message: OutboundMessage }[] = [];
  readonly read: string[] = [];
  failWith: DeliveryFailedError | undefined;

  send(
    to: string,
    message: OutboundMessage,
  ): Promise<Result<{ readonly channelMessageId: string | undefined }, DeliveryFailedError>> {
    if (this.failWith) {
      return Promise.resolve(err(this.failWith));
    }
    this.sent.push({ to, message });
    return Promise.resolve(ok({ channelMessageId: `wamid.out-${this.sent.length}` }));
  }

  markAsRead(channelMessageId: string) {
    this.read.push(channelMessageId);
    return Promise.resolve();
  }
}

/** Registra los pedidos de la unificación y devuelve las conversaciones que se le cargaron. */
export class FakeClientConversationMerge implements ClientConversationMerge {
  readonly moves: { readonly from: string; readonly to: string }[] = [];
  moved: readonly string[] = [];

  moveClient(fromClientId: string, toClientId: string): Promise<readonly string[]> {
    this.moves.push({ from: fromClientId, to: toClientId });
    return Promise.resolve(this.moved);
  }
}
