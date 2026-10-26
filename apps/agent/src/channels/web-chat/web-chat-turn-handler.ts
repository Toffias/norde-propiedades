import { OpportunitySearchSchema } from '@norde/core/clients';
import type {
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

import {
  buildWebChatReply,
  FALLBACK_TEXT,
  plainReply,
  UNSUPPORTED_TEXT,
  type WebChatReply,
  type WebChatReplyView,
} from './reply-builder';

/** Un mensaje del visitante, ya validado por la ruta. */
export interface WebChatInbound {
  readonly sessionId: string;
  readonly messageId: string;
  readonly text: string;
}

export type WebChatTurnResult =
  /** `reply: null` si no corresponde responder (duplicado, un "gracias", conversación derivada). */
  | { readonly kind: 'reply'; readonly reply: WebChatReplyView | null }
  /** La sesión superó sus límites de mensajes. */
  | { readonly kind: 'busy' }
  /** El agente no responde: fallas seguidas o tope diario del canal. */
  | { readonly kind: 'unavailable' };

export interface WebChatTurnHandlerDeps {
  readonly receiveInbound: Pick<ReceiveInboundMessages, 'execute'>;
  readonly sendReply: Pick<SendReply, 'execute'>;
  readonly assistant: Pick<CustomerAssistant, 'run'>;
  readonly actor: Actor;
  readonly breaker: FailureBreaker;
  /** Tope de gasto en OpenAI, compartido por los canales. */
  readonly budget: DailyBudget;
  /** Sitio público: los links del agente a otros dominios se quitan antes de responder. */
  readonly siteUrl: string;
  readonly now: () => Date;
  readonly logger: Logger;
}

/**
 * Atiende un mensaje del chat del sitio: lo registra, sigue el plan que decide el core y, si
 * corresponde, corre el agente. La respuesta vuelve en la misma petición HTTP. Corre dentro de la
 * cola de la sesión, así que nunca hay dos turnos en paralelo para la misma conversación.
 */
export class WebChatTurnHandler {
  constructor(private readonly deps: WebChatTurnHandlerDeps) {}

  async handle(inbound: WebChatInbound): Promise<WebChatTurnResult> {
    const { deps } = this;
    const received = await deps.receiveInbound.execute(
      {
        channel: 'web_chat',
        externalId: inbound.sessionId,
        messages: [
          {
            channelMessageId: inbound.messageId,
            kind: 'text',
            text: inbound.text,
            sentAt: deps.now(),
            rawType: 'text',
          },
        ],
      },
      deps.actor,
    );
    if (received.isErr()) {
      throw new Error(`Could not record web chat message: ${received.error.type}`);
    }

    const conversation = received.value;
    const log = deps.logger.child({ conversationId: conversation.conversationId });
    const { plan } = conversation;

    switch (plan.action) {
      case 'ignore':
        return { kind: 'reply', reply: null };
      case 'silent':
        if (plan.reason === 'channel_limit') {
          log.error('Web chat daily cap reached: the agent stops replying until it resets');
          return { kind: 'unavailable' };
        }
        log.debug({ reason: plan.reason }, 'No reply needed');
        return { kind: 'reply', reply: null };
      case 'notice':
        if (plan.notice === 'contact_limit') return { kind: 'busy' };
        return this.reply(conversation, plainReply(UNSUPPORTED_TEXT), log);
      case 'agent':
        return this.replyWithAgent(conversation, plan.userText, log);
    }
  }

  private async replyWithAgent(
    conversation: ReceiveInboundMessagesOutput,
    userText: string,
    log: Logger,
  ): Promise<WebChatTurnResult> {
    const { deps } = this;
    if (deps.breaker.isOpen()) {
      log.error('Agent breaker open after consecutive failures: web chat message left unanswered');
      return { kind: 'unavailable' };
    }
    if (deps.budget.exceeded()) {
      log.error('Daily OpenAI budget reached: the web chat answers unavailable');
      return { kind: 'unavailable' };
    }

    const previousSearch = OpportunitySearchSchema.safeParse(conversation.searchCriteria);
    const context = createTurnContext({
      channel: 'web_chat',
      channelExternalId: conversation.externalId,
      // El sitio no conoce el teléfono: el agente lo pide cuando el visitante quiere avanzar.
      phone: undefined,
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
        log.error('Agent breaker opened: the web chat answers unavailable until it recovers');
      }
      if (deps.breaker.isOpen()) return { kind: 'unavailable' };
      // El turno fallido no se guarda en la memoria.
      return this.reply(conversation, plainReply(FALLBACK_TEXT), log);
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
    return this.reply(conversation, buildWebChatReply(links.text, context), log, {
      agentTurn: {
        memory: turn.memory,
        searchCriteria: context.lastSearch,
        usage: turn.usage,
        promptVersion: PROMPT_VERSION,
      },
      clientId: context.registration?.clientId,
    });
  }

  /** Registra la respuesta en la conversación (y la memoria del agente) y la devuelve. */
  private async reply(
    conversation: ReceiveInboundMessagesOutput,
    built: WebChatReply,
    log: Logger,
    extra: Pick<Parameters<SendReply['execute']>[0], 'agentTurn' | 'clientId'> = {},
  ): Promise<WebChatTurnResult> {
    const sent = await this.deps.sendReply.execute(
      { conversationId: conversation.conversationId, message: built.stored, ...extra },
      this.deps.actor,
    );
    if (sent.isErr()) {
      // El visitante igual ve la respuesta; lo que se pierde es el registro del turno.
      log.error({ error: sent.error, type: built.stored.type }, 'Could not record web chat reply');
    }
    return { kind: 'reply', reply: built.view };
  }
}
