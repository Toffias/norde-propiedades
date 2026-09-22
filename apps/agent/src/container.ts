// Composition root: único archivo de la app que importa @norde/infra.
// Instancia los adaptadores y arma los casos de uso de @norde/core que expone la app.

import { NotifyTeamOfOpportunity, RegisterContact } from '@norde/core/clients';
import {
  ReceiveInboundMessages,
  SendReply,
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
  DrizzleClientRepository,
  DrizzleOpportunityRepository,
  DrizzlePropertySearchQuery,
  LogTeamNotifier,
  MetaWhatsAppMessenger,
  OutboxRelay,
  PgBossEventBus,
  SystemClock,
  UuidV7IdGenerator,
  WebhookTeamNotifier,
} from '@norde/infra';
import type { Logger } from 'pino';

import { createCustomerAssistant } from './assistant/customer-assistant';
import { FailureBreaker } from './channels/whatsapp/failure-breaker';
import type { WhatsAppInbound } from './channels/whatsapp/inbound';
import { KeyedQueue } from './channels/whatsapp/keyed-queue';
import { MessageBatcher } from './channels/whatsapp/message-batcher';
import { NoticeThrottle } from './channels/whatsapp/notices';
import type { WhatsAppWebhookOptions } from './channels/whatsapp/webhook-routes';
import { WhatsAppTurnHandler } from './channels/whatsapp/whatsapp-turn-handler';
import { whatsAppConfig, type Env } from './config/env';
import type { HealthCheck } from './http/routes/health';
import { eventSubscriptions } from './jobs/event-subscriptions';

const HOUR_MS = 3_600_000;

/** Permisos acotados de los actores de sistema de este proceso. */
const AGENT_ACTOR = Actor.system('agent-ia', [
  'properties:read',
  'clients:create',
  'conversations:receive',
  'conversations:reply',
]);
const SCHEDULER_ACTOR = Actor.system('scheduler', ['clients:read']);

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
  /** Arranca el relay del outbox y los workers (si `JOBS_ENABLED`). */
  startJobs(): Promise<void>;
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
  const notifyTeam = new NotifyTeamOfOpportunity({
    clients: new DrizzleClientRepository(db),
    opportunities: new DrizzleOpportunityRepository(db),
    notifier: env.TEAM_WEBHOOK_URL
      ? new WebhookTeamNotifier({ url: env.TEAM_WEBHOOK_URL, token: env.TEAM_WEBHOOK_TOKEN })
      : new LogTeamNotifier(logger),
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
  const messengers: ChannelMessengers = whatsappMessenger ? { whatsapp: whatsappMessenger } : {};

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

  const queue = new KeyedQueue();
  let batcher: MessageBatcher<WhatsAppInbound> | undefined;
  let whatsapp: Container['whatsapp'];

  if (whatsappMessenger && env.OPENAI_API_KEY) {
    const assistant = createCustomerAssistant({
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
    const handler = new WhatsAppTurnHandler({
      receiveInbound,
      sendReply,
      assistant,
      actor: AGENT_ACTOR,
      breaker: new FailureBreaker(
        env.AGENT_BREAKER_THRESHOLD,
        env.AGENT_BREAKER_COOLDOWN_MINUTES * 60_000,
      ),
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

  // Jobs: outbox → pg-boss → handlers
  const bus = new PgBossEventBus({
    connectionString: env.DATABASE_URL,
    applicationName: 'norde-agent-jobs',
    logger,
  });
  for (const subscription of eventSubscriptions({
    notifyTeam,
    actor: SCHEDULER_ACTOR,
    logger,
  })) {
    bus.subscribe(subscription);
  }
  const relay = new OutboxRelay({ db, logger, publish: (event) => bus.publish(event) });
  let jobsStarted = false;

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
    startJobs: async () => {
      if (!env.JOBS_ENABLED) {
        logger.warn('Jobs disabled (JOBS_ENABLED=false): outbox events will wait');
        return;
      }
      await bus.start();
      relay.start();
      jobsStarted = true;
    },
    close: async () => {
      // Primero se termina lo que está en curso; después se liberan las conexiones.
      await batcher?.drain();
      await queue.idle();
      if (jobsStarted) {
        await relay.stop();
        await bus.stop();
      }
      await database.close();
    },
  };
}
