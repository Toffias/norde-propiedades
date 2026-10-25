import { OpportunitySearchSchema } from '@norde/core/clients';
import {
  MAX_INBOUND_MESSAGES_PER_CALL,
  type OutboundMessage,
  type ReceiveInboundMessages,
  type ReceiveInboundMessagesError,
  type ReceiveInboundMessagesOutput,
  type SendReply,
} from '@norde/core/conversations';
import type { Result } from '@norde/core/shared';
import type { Actor } from '@norde/core/shared';
import type { Logger } from 'pino';

import type { CustomerAssistant } from '../../assistant/customer-assistant';
import { createTurnContext } from '../../assistant/turn-context';

import type { FailureBreaker } from '../shared/failure-breaker';
import type { WhatsAppInbound } from './inbound';
import { NOTICE_TEXT, type NoticeThrottle } from './notices';
import { buildWhatsAppReply, FALLBACK_TEXT } from './reply-builder';

export interface WhatsAppTurnHandlerDeps {
  readonly receiveInbound: Pick<ReceiveInboundMessages, 'execute'>;
  readonly sendReply: Pick<SendReply, 'execute'>;
  readonly assistant: Pick<CustomerAssistant, 'run'>;
  readonly actor: Actor;
  readonly breaker: FailureBreaker;
  readonly notices: NoticeThrottle;
  readonly now: () => Date;
  readonly logger: Logger;
}

/**
 * Atiende un lote de mensajes de un contacto: los registra, sigue el plan que decide el core
 * y, si corresponde, corre el agente y envía **una** respuesta. Corre dentro de la cola del
 * contacto, así que nunca hay dos turnos en paralelo para la misma conversación.
 */
export class WhatsAppTurnHandler {
  constructor(private readonly deps: WhatsAppTurnHandlerDeps) {}

  async handle(batch: readonly WhatsAppInbound[]): Promise<void> {
    const first = batch[0];
    if (!first) return;
    const { deps } = this;
    const contact = first.from;

    const received = await this.record(contact, batch);
    if (received.isErr()) {
      deps.logger.error({ error: received.error }, 'Could not record inbound WhatsApp messages');
      return;
    }

    const conversation = received.value;
    const log = deps.logger.child({ conversationId: conversation.conversationId });
    const { plan } = conversation;

    switch (plan.action) {
      case 'ignore':
        return;
      case 'silent':
        if (plan.reason === 'channel_limit') {
          log.error('WhatsApp daily cap reached: the agent stops replying until it resets');
        } else {
          log.debug({ reason: plan.reason }, 'No reply needed');
        }
        return;
      case 'notice':
        if (deps.notices.allow(plan.notice, contact)) {
          await this.send(conversation, { type: 'text', text: NOTICE_TEXT[plan.notice] }, log);
        }
        return;
      case 'agent':
        await this.replyWithAgent(conversation, plan.userText, log);
        return;
    }
  }

  /**
   * Registra el lote. Uno de más mensajes de los que acepta el core se registra en partes, en
   * orden, y responde lo que decide la última que registró algo: sigue siendo **una** respuesta.
   */
  private async record(
    contact: string,
    batch: readonly WhatsAppInbound[],
  ): Promise<Result<ReceiveInboundMessagesOutput, ReceiveInboundMessagesError>> {
    const { deps } = this;
    const contactName = batch.findLast((m) => m.profileName)?.profileName;
    let decided: Result<ReceiveInboundMessagesOutput, ReceiveInboundMessagesError> | undefined;
    for (let start = 0; start < batch.length; start += MAX_INBOUND_MESSAGES_PER_CALL) {
      const part = batch.slice(start, start + MAX_INBOUND_MESSAGES_PER_CALL);
      const received = await deps.receiveInbound.execute(
        {
          channel: 'whatsapp',
          externalId: contact,
          contactName,
          messages: part.map((m) => m.message),
        },
        deps.actor,
      );
      if (received.isErr()) return received;
      if (decided === undefined || received.value.plan.action !== 'ignore') decided = received;
    }
    if (decided === undefined) throw new Error('A WhatsApp batch cannot be empty');
    return decided;
  }

  private async replyWithAgent(
    conversation: ReceiveInboundMessagesOutput,
    userText: string,
    log: Logger,
  ): Promise<void> {
    const { deps } = this;
    if (deps.breaker.isOpen()) {
      log.error('Agent breaker open after consecutive failures: message left unanswered');
      return;
    }

    const previousSearch = OpportunitySearchSchema.safeParse(conversation.searchCriteria);
    const context = createTurnContext({
      channel: 'whatsapp',
      channelExternalId: conversation.externalId,
      phone: `+${conversation.externalId}`,
      contactName: conversation.contactName,
      previousSearch: previousSearch.success ? previousSearch.data : undefined,
      now: deps.now(),
    });

    const turn = await deps.assistant.run({
      memory: conversation.agentMemory,
      userText,
      context,
    });

    if (!turn.ok) {
      log.error({ err: turn.error }, 'Agent turn failed');
      if (deps.breaker.recordFailure()) {
        log.error('Agent breaker opened: no more fallback replies until it recovers');
      }
      if (deps.breaker.isOpen()) return;
      // El turno fallido no se guarda en la memoria.
      await this.send(conversation, { type: 'text', text: FALLBACK_TEXT }, log);
      return;
    }
    deps.breaker.recordSuccess();

    log.info(
      { ...turn.usage, tools: turn.toolCalls, registered: context.registration !== undefined },
      'Agent turn',
    );
    await this.send(conversation, buildWhatsAppReply(turn.text, context), log, {
      agentTurn: { memory: turn.memory, searchCriteria: context.lastSearch, usage: turn.usage },
      clientId: context.registration?.clientId,
    });
  }

  private async send(
    conversation: ReceiveInboundMessagesOutput,
    message: OutboundMessage,
    log: Logger,
    extra: Pick<Parameters<SendReply['execute']>[0], 'agentTurn' | 'clientId'> = {},
  ): Promise<void> {
    const sent = await this.deps.sendReply.execute(
      { conversationId: conversation.conversationId, message, ...extra },
      this.deps.actor,
    );
    if (sent.isErr()) {
      log.error({ error: sent.error, type: message.type }, 'Could not send WhatsApp reply');
    }
  }
}
