import {
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { OutboundMessageSchema, type SendReplyInput } from '../../contracts';
import type { ChannelMessengers, DeliveryFailedError } from '../ports/channel-messenger';
import type { ConversationsUnitOfWork } from '../ports/conversations-transaction';

export type SendReplyError =
  | ForbiddenError
  | { readonly type: 'ConversationNotFound' }
  | { readonly type: 'InvalidMessage'; readonly issues: readonly string[] }
  | { readonly type: 'InvalidClientId' }
  | { readonly type: 'ChannelUnavailable' }
  | DeliveryFailedError;

/**
 * Envía una respuesta por el canal de la conversación y la registra. Si es la respuesta del
 * agente, guarda lo que recuerda del turno (aunque el envío falle, para no perder contexto).
 */
export class SendReply {
  constructor(
    private readonly deps: {
      readonly uow: ConversationsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
      readonly messengers: ChannelMessengers;
    },
  ) {}

  async execute(
    input: SendReplyInput,
    actor: Actor,
  ): Promise<Result<{ readonly channelMessageId: string | undefined }, SendReplyError>> {
    if (!actor.can('conversations:reply')) return err({ type: 'Forbidden' });

    const message = OutboundMessageSchema.safeParse(input.message);
    if (!message.success) {
      return err({ type: 'InvalidMessage', issues: message.error.issues.map((i) => i.message) });
    }
    const conversationId = parseId<'Conversation'>(input.conversationId);
    if (conversationId.isErr()) return err({ type: 'ConversationNotFound' });
    const clientId = input.clientId === undefined ? undefined : parseId<'Client'>(input.clientId);
    if (clientId?.isErr()) return err({ type: 'InvalidClientId' });

    const target = await this.deps.uow.run((tx) => tx.conversations.findById(conversationId.value));
    if (!target) return err({ type: 'ConversationNotFound' });
    const messenger = this.deps.messengers[target.channel];
    if (!messenger) return err({ type: 'ChannelUnavailable' });

    // El envío va fuera de la transacción: no se retiene una conexión durante la llamada HTTP.
    const delivery = await messenger.send(target.externalId, message.data);
    const now = this.deps.clock.now();

    await this.deps.uow.run(async (tx) => {
      const conversation = await tx.conversations.findById(conversationId.value);
      if (!conversation) return;

      if (input.agentTurn) {
        conversation.recordAgentTurn({
          memory: input.agentTurn.memory,
          searchCriteria: input.agentTurn.searchCriteria,
        });
      }
      const linkedClient = clientId?.isOk() ? clientId.value : undefined;
      if (linkedClient && conversation.clientId !== linkedClient) {
        conversation.linkClient(linkedClient, now);
        await tx.audit.record({
          actorId: actor.id,
          action: 'conversation.linked_to_client',
          entityType: 'conversation',
          entityId: conversation.id,
          changes: { clientId: { before: target.clientId ?? null, after: linkedClient } },
        });
      }
      await tx.conversations.save(conversation);

      if (delivery.isOk()) {
        await tx.messages.appendOutbound({
          id: this.deps.ids.next(),
          conversationId: conversation.id,
          channel: conversation.channel,
          channelMessageId: delivery.value.channelMessageId,
          kind: message.data.type,
          body: {
            ...message.data,
            ...(input.agentTurn?.usage ? { usage: input.agentTurn.usage } : {}),
            sentBy: actor.id,
          },
          recordedAt: now,
        });
      }
      await tx.events.publish(conversation.pullEvents());
    });

    return delivery.isOk() ? ok(delivery.value) : err(delivery.error);
  }
}
