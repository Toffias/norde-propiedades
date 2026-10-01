import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  ReceiveInboundMessagesInputSchema,
  type InboundMessage,
  type ReceiveInboundMessagesInput,
  type ReceiveInboundMessagesOutput,
  type ReplyPlan,
} from '../../contracts';
import { Conversation } from '../../domain/conversation';
import { evaluateUsage, isAcknowledgementOnly, isStale } from '../../domain/reply-policy';
import type { ConversationPolicy } from '../conversation-policy';
import type { ChannelMessengers } from '../ports/channel-messenger';
import type {
  ConversationsTransaction,
  ConversationsUnitOfWork,
} from '../ports/conversations-transaction';

export type ReceiveInboundMessagesError =
  ForbiddenError | { readonly type: 'InvalidInput'; readonly issues: readonly string[] };

const HOUR_MS = 3_600_000;

/**
 * Registra los mensajes que mandó un contacto (idempotente ante reentregas) y decide cómo
 * responder: con el agente, con un aviso fijo o en silencio.
 */
export class ReceiveInboundMessages {
  constructor(
    private readonly deps: {
      readonly uow: ConversationsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
      readonly messengers: ChannelMessengers;
      readonly policy: ConversationPolicy;
    },
  ) {}

  async execute(
    input: ReceiveInboundMessagesInput,
    actor: Actor,
  ): Promise<Result<ReceiveInboundMessagesOutput, ReceiveInboundMessagesError>> {
    if (!actor.can('conversations:receive')) return err({ type: 'Forbidden' });

    const parsed = ReceiveInboundMessagesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const data = parsed.data;
    const { policy } = this.deps;
    const now = this.deps.clock.now();

    const outcome = await this.deps.uow.run(async (tx) => {
      let conversation = await tx.conversations.findByChannelIdentity(
        data.channel,
        data.externalId,
      );
      if (!conversation) {
        conversation = Conversation.start({
          id: nextId<'Conversation'>(this.deps.ids),
          channel: data.channel,
          externalId: data.externalId,
          contactName: data.contactName,
          now,
        });
        // Se guarda antes que los mensajes, que la referencian.
        await tx.conversations.save(conversation);
        // Sin teléfono ni nombre: la conversación todavía no tiene cliente al que asociarlos
        // (`client_ids`), y sin eso no se podrían suprimir.
        await tx.audit.record(
          auditCreated(
            actor,
            {
              action: 'conversation.started',
              entityType: 'conversation',
              entityId: conversation.id,
              clientIds: [],
            },
            { channel: conversation.channel, status: conversation.status },
          ),
        );
      }

      const recorded: InboundMessage[] = [];
      for (const message of data.messages) {
        const text = message.text.trim().slice(0, policy.maxInboundTextChars);
        const inserted = await tx.messages.appendInbound({
          id: this.deps.ids.next(),
          conversationId: conversation.id,
          channel: data.channel,
          channelMessageId: message.channelMessageId,
          kind: message.kind,
          body: { text, rawType: message.rawType },
          sentAt: message.sentAt,
          recordedAt: now,
        });
        if (inserted) recorded.push({ ...message, text });
      }

      if (recorded.length === 0) {
        await tx.events.publish(conversation.pullEvents());
        return { conversation, recorded, memoryReset: false, plan: { action: 'ignore' } as const };
      }

      const { memoryReset } = conversation.registerInbound({
        now,
        contactName: data.contactName,
        idleResetAfterMs: policy.idleResetAfterMs,
      });
      const plan = await this.plan(conversation, recorded, now, tx);

      await tx.conversations.save(conversation);
      await tx.events.publish(conversation.pullEvents());
      return { conversation, recorded, memoryReset, plan };
    });

    const { conversation, recorded, memoryReset, plan } = outcome;
    const last = recorded.at(-1);
    // El acuse de lectura del último marca también los anteriores.
    if (last) await this.deps.messengers[data.channel]?.markAsRead(last.channelMessageId);

    return ok({
      conversationId: conversation.id,
      externalId: conversation.externalId,
      contactName: conversation.contactName,
      clientId: conversation.clientId,
      agentMemory: conversation.agentMemory,
      searchCriteria: conversation.searchCriteria,
      memoryReset,
      plan,
    });
  }

  private async plan(
    conversation: Conversation,
    recorded: readonly InboundMessage[],
    now: Date,
    tx: ConversationsTransaction,
  ): Promise<ReplyPlan> {
    const fresh = recorded.filter((m) => !isStale(m.sentAt, now, this.deps.policy.maxInboundAgeMs));
    if (fresh.length === 0) return { action: 'ignore' };
    if (!conversation.canBotReply()) return { action: 'silent', reason: 'handed_off' };

    const texts = fresh.filter((m) => m.kind !== 'unsupported' && m.text !== '').map((m) => m.text);
    if (texts.length === 0) return { action: 'notice', notice: 'unsupported_content' };

    const userText = texts.join('\n');
    if (isAcknowledgementOnly(userText)) return { action: 'silent', reason: 'acknowledgement' };

    const limits = this.deps.policy.usageLimits[conversation.channel];
    if (limits) {
      const [contactLastHour, contactLastDay, outboundLastDay] = await Promise.all([
        tx.messages.countInboundSince(conversation.id, new Date(now.getTime() - HOUR_MS)),
        tx.messages.countInboundSince(conversation.id, new Date(now.getTime() - 24 * HOUR_MS)),
        tx.messages.countOutboundSince(
          conversation.channel,
          new Date(now.getTime() - 24 * HOUR_MS),
        ),
      ]);
      const usage = evaluateUsage({ contactLastHour, contactLastDay, outboundLastDay }, limits);
      if (!usage.allowed) {
        return usage.reason === 'channel_day'
          ? { action: 'silent', reason: 'channel_limit' }
          : { action: 'notice', notice: 'contact_limit' };
      }
    }

    return { action: 'agent', userText };
  }
}
