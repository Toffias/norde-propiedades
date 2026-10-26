// Composition root: único archivo de la app que importa @norde/infra.
// Instancia los adaptadores y arma los casos de uso de @norde/core que expone la app. Los procesos
// en segundo plano (relay del outbox y jobs) corren en apps/gestion (ADR 0021).

import { RegisterContact } from '@norde/core/clients';
import {
  ReceiveInboundMessages,
  SendReply,
  TranscribeAudioMessage,
  type ChannelMessenger,
  type ChannelMessengers,
  type ConversationPolicy,
} from '@norde/core/conversations';
import { GetPropertyDetail, SearchProperties } from '@norde/core/properties';
import { Actor } from '@norde/core/shared';
import {
  createClientsUnitOfWork,
  createConversationsUnitOfWork,
  createDatabase,
  DrizzlePropertySearchQuery,
  MetaWhatsAppMessenger,
  SystemClock,
  UuidV7IdGenerator,
  WebChatMessenger,
  WhatsAppAudioTranscriber,
} from '@norde/infra';
import type { Logger } from 'pino';

import { createCustomerAssistant } from './assistant/customer-assistant';
import { FailureBreaker } from './channels/shared/failure-breaker';
import type { WhatsAppInbound } from './channels/whatsapp/inbound';
import { KeyedQueue } from './channels/shared/keyed-queue';
import type { WebChatRouteOptions } from './channels/web-chat/web-chat-routes';
import { WebChatTurnHandler } from './channels/web-chat/web-chat-turn-handler';
import { MessageBatcher } from './channels/whatsapp/message-batcher';
import { NoticeThrottle } from './channels/whatsapp/notices';
import type { WhatsAppWebhookOptions } from './channels/whatsapp/webhook-routes';
import { WhatsAppTurnHandler } from './channels/whatsapp/whatsapp-turn-handler';
import { whatsAppConfig, type Env } from './config/env';
import type { HealthCheck } from './http/routes/health';

const HOUR_MS = 3_600_000;

/** El único actor de este proceso: el agente de IA, con lo justo para conversar. */
const AGENT_ACTOR = Actor.system('agent-ia', [
  'properties:read',
  'clients:create',
  'conversations:receive',
  'conversations:reply',
]);

export interface ContainerOverrides {
  /** Reemplaza el envío por WhatsApp (el simulador imprime en consola). */
  readonly whatsappMessenger?: ChannelMessenger;
}

export interface Container {
  readonly healthCheck: HealthCheck;
  /** `undefined` si el canal WhatsApp no está configurado. */
  readonly whatsapp:
    | {
        readonly webhook: WhatsAppWebhookOptions | undefined;
        readonly handler: WhatsAppTurnHandler;
      }
    | undefined;
  /** `undefined` si el chat del sitio no está configurado (`WEB_CHAT_SECRET`). */
  readonly webChat: WebChatRouteOptions | undefined;
  close(): Promise<void>;
}

export function createContainer(
  env: Env,
  logger: Logger,
  overrides: ContainerOverrides = {},
): Container {
  const database = createDatabase({ url: env.DATABASE_URL, applicationName: 'norde-agent' });
  const { db } = database;
  const clock = new SystemClock();
  const ids = new UuidV7IdGenerator();

  // Casos de uso
  const properties = new DrizzlePropertySearchQuery(db);
  const searchProperties = new SearchProperties({ properties });
  const getPropertyDetail = new GetPropertyDetail({ properties });
  const registerContact = new RegisterContact({
    uow: createClientsUnitOfWork(db, { ids, clock }),
    ids,
    clock,
  });

  // Canal WhatsApp
  const credentials = whatsAppConfig(env);
  const whatsappMessenger =
    overrides.whatsappMessenger ??
    (credentials &&
      new MetaWhatsAppMessenger({
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
        apiVersion: env.WHATSAPP_API_VERSION,
        baseUrl: env.WHATSAPP_API_BASE_URL,
        stripArgentineNine: env.WHATSAPP_STRIP_AR_NINE,
        logger,
      }));
  const webChatEnabled = env.WEB_CHAT_SECRET !== undefined && env.OPENAI_API_KEY !== undefined;
  const messengers: ChannelMessengers = {
    ...(whatsappMessenger && { whatsapp: whatsappMessenger }),
    ...(webChatEnabled && { web_chat: new WebChatMessenger() }),
  };

  const policy: ConversationPolicy = {
    idleResetAfterMs: env.CONVERSATION_IDLE_RESET_HOURS * HOUR_MS,
    maxInboundAgeMs: env.MAX_INBOUND_AGE_HOURS * HOUR_MS,
    maxInboundTextChars: env.MAX_INBOUND_TEXT_CHARS,
    usageLimits: {
      whatsapp: {
        perContactPerHour: env.LIMIT_CONTACT_MESSAGES_PER_HOUR,
        perContactPerDay: env.LIMIT_CONTACT_MESSAGES_PER_DAY,
        outboundPerDay: env.LIMIT_WHATSAPP_OUTBOUND_PER_DAY,
      },
      web_chat: {
        perContactPerHour: env.LIMIT_CONTACT_MESSAGES_PER_HOUR,
        perContactPerDay: env.LIMIT_CONTACT_MESSAGES_PER_DAY,
        outboundPerDay: env.LIMIT_WEB_CHAT_REPLIES_PER_DAY,
      },
    },
  };
  const conversationsUow = createConversationsUnitOfWork(db, { ids, clock });
  const receiveInbound = new ReceiveInboundMessages({
    uow: conversationsUow,
    ids,
    clock,
    messengers,
    policy,
  });
  const sendReply = new SendReply({ uow: conversationsUow, ids, clock, messengers });

  // El mismo agente y el mismo breaker para todos los canales: si OpenAI falla, falla en todos.
  const assistant =
    env.OPENAI_API_KEY === undefined
      ? undefined
      : createCustomerAssistant({
          model: { name: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY },
          maxMemoryItems: env.AGENT_MAX_MEMORY_ITEMS,
          onToolError: (tool, error) => {
            logger.error({ err: error, tool }, 'Agent tool failed');
          },
          actor: AGENT_ACTOR,
          siteUrl: env.PUBLIC_SITE_URL,
          searchProperties,
          getPropertyDetail,
          registerContact,
        });
  const breaker = new FailureBreaker(
    env.AGENT_BREAKER_THRESHOLD,
    env.AGENT_BREAKER_COOLDOWN_MINUTES * 60_000,
  );

  // WhatsApp y el chat del sitio comparten la cola: las claves (número, sesión) no se pisan.
  const queue = new KeyedQueue();
  let batcher: MessageBatcher<WhatsAppInbound> | undefined;
  let whatsapp: Container['whatsapp'];

  if (whatsappMessenger && assistant) {
    const transcribeAudio =
      credentials && env.OPENAI_API_KEY
        ? new TranscribeAudioMessage({
            transcriber: new WhatsAppAudioTranscriber({
              accessToken: credentials.accessToken,
              apiVersion: env.WHATSAPP_API_VERSION,
              baseUrl: env.WHATSAPP_API_BASE_URL,
              openai: { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TRANSCRIBE_MODEL },
            }),
          })
        : undefined;
    const handler = new WhatsAppTurnHandler({
      receiveInbound,
      sendReply,
      transcribeAudio,
      assistant,
      actor: AGENT_ACTOR,
      breaker,
      siteUrl: env.PUBLIC_SITE_URL,
      notices: new NoticeThrottle(HOUR_MS),
      now: () => clock.now(),
      logger,
    });
    const activeBatcher = new MessageBatcher<WhatsAppInbound>({
      queue,
      keyOf: (message) => message.from,
      debounceMs: env.WHATSAPP_DEBOUNCE_MS,
      process: (messages) => handler.handle(messages),
      onError: (error, messages) => {
        logger.error({ err: error, count: messages.length }, 'WhatsApp batch failed');
      },
    });
    batcher = activeBatcher;
    whatsapp = {
      handler,
      webhook: credentials && {
        verifyToken: credentials.verifyToken,
        appSecret: credentials.appSecret,
        phoneNumberId: credentials.phoneNumberId,
        onMessage: (message) => {
          activeBatcher.push(message);
        },
      },
    };
  } else {
    logger.warn('WhatsApp channel disabled: set the WHATSAPP_* variables and OPENAI_API_KEY');
  }

  let webChat: Container['webChat'];
  if (webChatEnabled && assistant && env.WEB_CHAT_SECRET) {
    const handler = new WebChatTurnHandler({
      receiveInbound,
      sendReply,
      assistant,
      actor: AGENT_ACTOR,
      breaker,
      siteUrl: env.PUBLIC_SITE_URL,
      now: () => clock.now(),
      logger,
    });
    webChat = {
      secret: env.WEB_CHAT_SECRET,
      handle: (message) =>
        queue.enqueue(`web_chat:${message.sessionId}`, () => handler.handle(message)),
    };
  } else {
    logger.warn('Web chat disabled: set WEB_CHAT_SECRET and OPENAI_API_KEY');
  }

  return {
    healthCheck: async () => {
      try {
        await database.ping();
        return { database: 'up' };
      } catch (error) {
        logger.warn({ err: error }, 'database health check failed');
        return { database: 'down' };
      }
    },
    whatsapp,
    webChat,
    close: async () => {
      // Primero se termina lo que está en curso; después se liberan las conexiones.
      await batcher?.drain();
      await queue.idle();
      await database.close();
    },
  };
}
