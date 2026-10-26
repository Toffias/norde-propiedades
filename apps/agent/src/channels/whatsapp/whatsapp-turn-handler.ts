import { OpportunitySearchSchema } from '@norde/core/clients';
import type {
  OutboundMessage,
  ReceiveInboundMessages,
  ReceiveInboundMessagesOutput,
  SendReply,
} from '@norde/core/conversations';
import type { Actor } from '@norde/core/shared';
import type { Logger } from 'pino';

import type { CustomerAssistant } from '../../assistant/customer-assistant';
import { PROMPT_VERSION } from '../../assistant/instructions/build-instructions';
import { keepAllowedLinks } from '../../assistant/link-policy';
import { toolCallsForLog } from '../../assistant/tool-call-log';
import { createTurnContext } from '../../assistant/turn-context';

import type { DailyBudget } from '../shared/daily-budget';
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
  /** Tope de gasto en OpenAI, compartido por los canales. */
  readonly budget: DailyBudget;
  /** Sitio público: los links del agente a otros dominios se quitan antes de responder. */
  readonly siteUrl: string;
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

    const received = await deps.receiveInbound.execute(
      {
        channel: 'whatsapp',
        externalId: contact,
        contactName: batch.findLast((m) => m.profileName)?.profileName,
        messages: batch.map((m) => m.message),
      },
      deps.actor,
    );
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

  private async replyWithAgent(
    conversation: ReceiveInboundMessagesOutput,
    userText: string,
    log: Logger,
  ): Promise<void> {
    const { deps } = this;
    if (deps.breaker.isOpen()) {
      log.error('Agent breaker open after consecutive failures: message left unanswered');
      await this.unavailable(conversation, log);
      return;
    }
    if (deps.budget.exceeded()) {
      log.error('Daily OpenAI budget reached: message left unanswered');
      await this.unavailable(conversation, log);
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
      knownClient: conversation.clientId !== undefined,
      freshMemory: conversation.agentMemory.length === 0,
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
      if (deps.breaker.isOpen()) {
        await this.unavailable(conversation, log);
        return;
      }
      // El turno fallido no se guarda en la memoria.
      await this.send(conversation, { type: 'text', text: FALLBACK_TEXT }, log);
      return;
    }
    deps.breaker.recordSuccess();

    const costUsd = deps.budget.record(turn.usage);
    log.info(
      {
        ...turn.usage,
        costUsd,
        promptVersion: PROMPT_VERSION,
        tools: turn.toolCalls.map((call) => call.name),
        flagged: turn.flagged,
        registered: context.registration !== undefined,
      },
      'Agent turn',
    );
    log.debug({ tools: toolCallsForLog(turn.toolCalls) }, 'Agent tool calls');
    const links = keepAllowedLinks(turn.text ?? '', deps.siteUrl);
    if (links.removed > 0) {
      log.warn({ removed: links.removed }, 'Agent reply had links to other domains: removed');
    }
    await this.send(conversation, buildWhatsAppReply(links.text, context), log, {
      agentTurn: {
        memory: turn.memory,
        searchCriteria: context.lastSearch,
        usage: turn.usage,
        promptVersion: PROMPT_VERSION,
      },
      clientId: context.registration?.clientId,
    });
  }

  /**
   * El agente no puede responder (OpenAI caído o tope de gasto): un aviso fijo, una sola vez por
   * hora por contacto, en lugar de dejarlo sin respuesta. Cada aviso se cobra.
   */
  private async unavailable(conversation: ReceiveInboundMessagesOutput, log: Logger) {
    if (!this.deps.notices.allow('agent_unavailable', conversation.externalId)) return;
    await this.send(conversation, { type: 'text', text: NOTICE_TEXT.agent_unavailable }, log);
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
