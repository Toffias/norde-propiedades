// Composition root: único archivo de la app que importa @norde/infra.
// Instancia los adaptadores y arma los casos de uso de @norde/core que expone la app.

import {
  ApplyOpportunityRules,
  RouteInquiry,
  NotifyTeamOfOpportunity,
  ReceiveInquiry,
  RecordClientActivity,
  RegisterContact,
  RunClientImport,
  RunOpportunityBulkOperation,
  type ClientAgents,
  type InquiryPropertyLookup,
  type OpportunityRequesters,
} from '@norde/core/clients';
import {
  EraseClientConversations,
  ReceiveInboundMessages,
  SendReply,
  type ChannelMessenger,
  type ChannelMessengers,
  type ConversationPolicy,
} from '@norde/core/conversations';
import {
  DeleteStoredMediaFiles,
  GeneratePropertyMediaVariants,
  GetPropertyDetail,
  GetPropertyInterestProfile,
  GetPropertySummaries,
  RenderPropertyDocument,
  SearchProperties,
  UnlinkErasedClients,
  type OwnerReports,
} from '@norde/core/properties';
import { RemoveErasedClientFavorites, ResolveSessionActor } from '@norde/core/identity';
import { GetOwnerReport, type ReportingPropertyProfiles } from '@norde/core/reporting';
import type { FileStorage } from '@norde/core/settings';
import { Actor } from '@norde/core/shared';
import {
  createClientsUnitOfWork,
  createConversationsUnitOfWork,
  createDatabase,
  createPropertiesUnitOfWork,
  DrizzleClientConversationErasure,
  DrizzleClientFavoriteErasure,
  DrizzleCompanySettingsRepository,
  DrizzleDirectory,
  DrizzlePropertyClientErasure,
  DrizzlePropertyDetailLookups,
  DrizzlePropertyStatisticsQuery,
  LocalFileStorage,
  PdfLibPropertyDocumentRenderer,
  S3FileStorage,
  SharpImageVariantGenerator,
  SharpImageWatermarker,
  DrizzleClientRepository,
  DrizzleOpportunityPipelineQuery,
  DrizzleOpportunityRepository,
  DrizzlePanelPropertyListQuery,
  DrizzlePropertySearchQuery,
  DrizzleUserAccessQuery,
  LogTeamNotifier,
  MetaWhatsAppMessenger,
  OutboxRelay,
  PgBossEventBus,
  SystemClock,
  UuidV7IdGenerator,
  WebhookTeamNotifier,
  XlsxSpreadsheetReader,
  type Database,
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
import type { WebInquiryWebhookOptions } from './webhooks/web-inquiry-routes';

const HOUR_MS = 3_600_000;

/** Permisos acotados de los actores de sistema de este proceso. */
const AGENT_ACTOR = Actor.system('agent-ia', [
  'properties:read',
  'clients:create',
  'conversations:receive',
  'conversations:reply',
]);
const SCHEDULER_ACTOR = Actor.system('scheduler', [
  'clients:read',
  'clients:record-activity',
  'properties:read',
  'properties:process-media',
  'properties:render-documents',
  'conversations:erase-client-data',
  'properties:erase-client-data',
  'identity:erase-client-data',
  'opportunities:apply-rules',
  'opportunities:run-bulk',
  'inquiries:route',
]);
/** Las consultas del formulario web: quedan creadas y auditadas por `system:web`. */
const WEB_ACTOR = Actor.system('web', ['inquiries:receive', 'properties:read']);
/** Arma el actor de quien pidió una acción masiva, con sus permisos de ahora. */
const AUTH_ACTOR = Actor.system('auth', ['sessions:resolve']);
/** Las importaciones desde Excel: los contactos quedan creados y auditados por `system:import`. */
const IMPORT_ACTOR = Actor.system('import', ['clients:run-imports']);

function createStorage(env: Env): FileStorage {
  if (env.STORAGE_DRIVER !== 's3') return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  // `loadEnv` ya exigió estas variables con STORAGE_DRIVER=s3.
  return new S3FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? '',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  });
}

/** Las reglas automáticas de estado y las acciones masivas encoladas de oportunidades (#9). */
function createOpportunityJobs(
  db: Database,
  deps: { readonly ids: UuidV7IdGenerator; readonly clock: SystemClock },
) {
  const { ids, clock } = deps;
  const uow = createClientsUnitOfWork(db, { ids, clock });
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const agents: ClientAgents = {
    names: (userIds) => directory.names('user', userIds),
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
  const resolveActor = new ResolveSessionActor({ users: userAccess });
  // El job procesa como quien la pidió: si ya no está activo, no hay actor y la operación falla.
  const requesters: OpportunityRequesters = {
    async actorFor(userId) {
      const result = await resolveActor.execute({ userId }, AUTH_ACTOR);
      return result.isOk() ? result.value.actor : undefined;
    },
  };
  return {
    applyRules: new ApplyOpportunityRules({ uow, ids, clock }),
    runBulk: new RunOpportunityBulkOperation({
      uow,
      pipeline: new DrizzleOpportunityPipelineQuery(db),
      agents,
      requesters,
      ids,
      clock,
    }),
  };
}

/** El reparto automático de consultas por reglas (#10): `RouteInquiry` con los agentes activos. */
function createInquiryRouting(
  db: Database,
  deps: { readonly ids: UuidV7IdGenerator; readonly clock: SystemClock },
) {
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const agents: ClientAgents = {
    names: (userIds) => directory.names('user', userIds),
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
  return new RouteInquiry({ uow: createClientsUnitOfWork(db, deps), agents, ...deps });
}

/** La entrada de consultas (#10): `ReceiveInquiry` con los datos de la propiedad consultada. */
function createInquiryIntake(
  db: Database,
  deps: { readonly ids: UuidV7IdGenerator; readonly clock: SystemClock },
) {
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const summaries = new GetPropertySummaries({
    properties: new DrizzlePanelPropertyListQuery(db),
    users: { names: (userIds) => directory.names('user', userIds) },
  });
  // Por la API pública de properties; la sucursal de la propiedad es la de su captador.
  const properties: InquiryPropertyLookup = {
    async facts(propertyId) {
      const rows = await summaries.execute({ ids: [propertyId] }, WEB_ACTOR);
      const row = rows.isOk() ? rows.value[0] : undefined;
      if (!row) return undefined;
      const producer = row.producer && (await userAccess.findByUserId(row.producer.id));
      return {
        branchId: producer?.branchId,
        propertyType: row.propertyType,
        operations: row.operations.map((o) => o.operation),
        neighborhood: row.neighborhood,
      };
    },
  };
  return new ReceiveInquiry({ uow: createClientsUnitOfWork(db, deps), properties, ...deps });
}

/** Los jobs de la ficha de propiedad: variantes de fotos, limpieza del storage y PDF (#6). */
function createPropertyJobs(
  db: Database,
  env: Env,
  deps: { readonly ids: UuidV7IdGenerator; readonly clock: SystemClock },
) {
  const { clock } = deps;
  const uow = createPropertiesUnitOfWork(db, deps);
  const storage = createStorage(env);
  const settings = new DrizzleCompanySettingsRepository(db, clock);
  const directory = new DrizzleDirectory(db);
  const users = { names: (userIds: readonly string[]) => directory.names('user', userIds) };
  const interestProfile = new GetPropertyInterestProfile({ uow });
  const profiles: ReportingPropertyProfiles = {
    async find(propertyId, actor) {
      const profile = await interestProfile.execute({ propertyId }, actor);
      return profile.isOk() ? profile.value : undefined;
    },
  };
  const ownerReport = new GetOwnerReport({
    profiles,
    statistics: new DrizzlePropertyStatisticsQuery(db),
  });
  const ownerReports: OwnerReports = {
    async build(propertyId, period, actor) {
      const report = await ownerReport.execute({ propertyId, ...period }, actor);
      return report.isOk() ? report.value : undefined;
    },
  };
  return {
    generateMediaVariants: new GeneratePropertyMediaVariants({
      uow,
      storage,
      images: new SharpImageVariantGenerator(),
      watermarker: new SharpImageWatermarker(),
      settings,
      clock,
    }),
    deleteStoredMediaFiles: new DeleteStoredMediaFiles({ storage }),
    renderDocument: new RenderPropertyDocument({
      uow,
      lookups: new DrizzlePropertyDetailLookups(db),
      users,
      storage,
      settings,
      renderer: new PdfLibPropertyDocumentRenderer(),
      ownerReports,
      clock,
    }),
  };
}

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
  /** `undefined` si no hay `INQUIRY_WEBHOOK_SECRET`. */
  readonly webInquiries: WebInquiryWebhookOptions | undefined;
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
    clients: new DrizzleClientRepository(db, ids),
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

  // Consultas del formulario web
  const receiveInquiry = createInquiryIntake(db, { ids, clock });
  const webInquiries: WebInquiryWebhookOptions | undefined = env.INQUIRY_WEBHOOK_SECRET
    ? {
        secret: env.INQUIRY_WEBHOOK_SECRET,
        ratePerMinute: env.INQUIRY_WEBHOOK_RATE_PER_MINUTE,
        receive: (input) => receiveInquiry.execute(input, WEB_ACTOR),
      }
    : undefined;
  if (!webInquiries) logger.warn('Web inquiry webhook disabled: set INQUIRY_WEBHOOK_SECRET');

  // Jobs: outbox → pg-boss → handlers
  const bus = new PgBossEventBus({
    connectionString: env.DATABASE_URL,
    applicationName: 'norde-agent-jobs',
    logger,
  });
  for (const subscription of eventSubscriptions({
    notifyTeam,
    recordActivity: new RecordClientActivity({ uow: createClientsUnitOfWork(db, { ids, clock }) }),
    properties: createPropertyJobs(db, env, { ids, clock }),
    erasure: {
      conversations: new EraseClientConversations({
        erasure: new DrizzleClientConversationErasure(db),
      }),
      properties: new UnlinkErasedClients({ erasure: new DrizzlePropertyClientErasure(db) }),
      favorites: new RemoveErasedClientFavorites({
        favorites: new DrizzleClientFavoriteErasure(db),
      }),
    },
    runImport: new RunClientImport({
      uow: createClientsUnitOfWork(db, { ids, clock }),
      reader: new XlsxSpreadsheetReader(),
      storage: createStorage(env),
      ids,
      clock,
    }),
    opportunities: createOpportunityJobs(db, { ids, clock }),
    routeInquiry: createInquiryRouting(db, { ids, clock }),
    actor: SCHEDULER_ACTOR,
    importActor: IMPORT_ACTOR,
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
    webInquiries,
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
