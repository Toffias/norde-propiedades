import { errorSummary } from '@norde/agent-kit';
import { OpportunitySearchSchema } from '@norde/core/clients';
import {
  MAX_INBOUND_MESSAGES_PER_CALL,
  type InboundMessage,
  type OutboundMessage,
  type ReceiveInboundMessages,
  type ReceiveInboundMessagesError,
  type ReceiveInboundMessagesOutput,
  type SendReply,
  type TranscribeAudioMessage,
} from '@norde/core/conversations';
import type { Result } from '@norde/core/shared';
import type { Actor } from '@norde/core/shared';
import type { Logger } from 'pino';

import type { CustomerAssistant } from '../../assistant/customer-assistant';
import { PROMPT_VERSION } from '../../assistant/instructions/build-instructions';
import { keepAllowedLinks } from '../../assistant/link-policy';
import { mergeRecentProperties, parseRecentProperties } from '../../assistant/recent-properties';
import { toolCallsForLog } from '../../assistant/tool-call-log';
import { createTurnContext } from '../../assistant/turn-context';

import type { DailyBudget } from '../shared/daily-budget';
import type { FailureBreaker } from '../shared/failure-breaker';
import type { WhatsAppInbound } from './inbound';
import { NOTICE_TEXT, type NoticeThrottle } from './notices';
import { RecentIds } from './recent-ids';
import { buildWhatsAppReply, FALLBACK_TEXT } from './reply-builder';

export interface WhatsAppTurnHandlerDeps {
  readonly receiveInbound: Pick<ReceiveInboundMessages, 'execute'>;
  readonly sendReply: Pick<SendReply, 'execute'>;
  /** Sin transcripción, un audio se contesta con el aviso de contenido no soportado. */
  readonly transcribeAudio?: Pick<TranscribeAudioMessage, 'execute'> | undefined;
  /** Costo estimado de transcribir un audio, en USD: se suma al tope de gasto. */
  readonly audioCostUsd: number;
  readonly assistant: Pick<CustomerAssistant, 'run'>;
  readonly actor: Actor;
  readonly breaker: FailureBreaker;
  /** Horas sin mensajes tras las que se borra la memoria del agente (para avisarle al cliente). */
  readonly memoryResetAfterHours: number;
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
  /** Mensajes ya registrados: una reentrega de Meta no vuelve a pagar la transcripción. */
  readonly #recorded = new RecentIds(10_000);

  constructor(private readonly deps: WhatsAppTurnHandlerDeps) {}

  async handle(batch: readonly WhatsAppInbound[]): Promise<void> {
    const first = batch[0];
    if (!first) return;
    const { deps } = this;
    const contact = first.from;

    const messages = await Promise.all(batch.map((m) => this.readable(m)));
    const received = await this.record(contact, batch, messages);
    if (received.isErr()) {
      deps.logger.error({ error: received.error }, 'Could not record inbound WhatsApp messages');
      return;
    }
    for (const m of batch) this.#recorded.add(m.message.channelMessageId);

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
    messages: readonly InboundMessage[],
  ): Promise<Result<ReceiveInboundMessagesOutput, ReceiveInboundMessagesError>> {
    const { deps } = this;
    const contactName = batch.findLast((m) => m.profileName)?.profileName;
    let decided: Result<ReceiveInboundMessagesOutput, ReceiveInboundMessagesError> | undefined;
    for (let start = 0; start < messages.length; start += MAX_INBOUND_MESSAGES_PER_CALL) {
      const received = await deps.receiveInbound.execute(
        {
          channel: 'whatsapp',
          externalId: contact,
          contactName,
          messages: messages.slice(start, start + MAX_INBOUND_MESSAGES_PER_CALL),
        },
        deps.actor,
      );
      if (received.isErr()) return received;
      if (decided === undefined || received.value.plan.action !== 'ignore') decided = received;
    }
    if (decided === undefined) throw new Error('A WhatsApp batch cannot be empty');
    return decided;
  }

  /**
   * El mensaje tal como lo lee el agente: un audio, transcrito. Si no se puede, queda como llegó.
   * No se transcribe una reentrega ni con el tope de gasto alcanzado (el agente no va a responder).
   */
  private async readable(inbound: WhatsAppInbound): Promise<InboundMessage> {
    const { deps } = this;
    if (!inbound.audioMediaId || !deps.transcribeAudio) return inbound.message;
    if (this.#recorded.has(inbound.message.channelMessageId) || deps.budget.exceeded()) {
      return inbound.message;
    }
    try {
      const result = await deps.transcribeAudio.execute(
        { mediaId: inbound.audioMediaId },
        deps.actor,
      );
      // OpenAI cobra el audio aunque no tenga palabras.
      if (result.isOk() || result.error.type === 'EmptyTranscript') {
        deps.budget.recordUsd(deps.audioCostUsd);
      }
      if (result.isErr()) {
        deps.logger.info({ reason: result.error.type }, 'WhatsApp audio not transcribed');
        return inbound.message;
      }
      return { ...inbound.message, kind: 'audio', text: result.value.text };
    } catch (error) {
      deps.logger.error({ error: errorSummary(error) }, 'WhatsApp audio transcription failed');
      return inbound.message;
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
      recentProperties: parseRecentProperties(conversation.shownProperties),
      now: deps.now(),
      knownClient: conversation.clientId !== undefined,
      freshMemory: conversation.agentMemory.length === 0,
      memoryResetAfterHours: conversation.memoryReset ? deps.memoryResetAfterHours : undefined,
    });

    const turn = await deps.assistant.run({
      memory: conversation.agentMemory,
      userText,
      context,
    });

    if (!turn.ok) {
      // Un turno fallido también se cobra (hasta `maxTurns` llamadas al modelo).
      const failedCostUsd = deps.budget.record(turn.usage);
      // Solo nombre y mensaje: el error del SDK carga el estado del turno con toda la conversación.
      log.error(
        { error: errorSummary(turn.error), ...turn.usage, costUsd: failedCostUsd },
        'Agent turn failed',
      );
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
        shownProperties: mergeRecentProperties(
          context.recentProperties,
          context.shownProperties.values(),
        ),
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
