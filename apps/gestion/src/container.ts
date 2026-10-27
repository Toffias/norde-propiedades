import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core que usan los Server Components y las Server Actions, y los
// procesos en segundo plano: el relay del outbox y los workers de pg-boss (ADR 0021).

import {
  DeleteAppraisalPhotoFiles,
  EraseClientAppraisals,
  MoveMergedClientAppraisals,
  ChangeAppraisalStatus,
  ConvertAppraisalToListing,
  CreateAppraisal,
  DeleteAppraisalPhoto,
  DownloadAppraisalReport,
  GetAppraisalPhotoFile,
  RecordAppraisalResult,
  UploadAppraisalPhoto,
  DeleteAppraisal,
  GetAppraisal,
  GetSourceAppraisal,
  ListAppraisalHistory,
  ListAppraisals,
  RestoreAppraisal,
  UpdateAppraisal,
  type ActiveUsers,
  type PanelDirectory,
} from '@norde/core/appraisals';
import { ListNews } from '@norde/core/audit';
import {
  AddFavorites,
  AddTeamMember,
  ChangeOwnPassword,
  CreateBranch,
  CreateRole,
  CreateTeam,
  CreateUser,
  RunTokkoUsersImport,
  StartTokkoUsersImport,
  DeleteBranch,
  DeleteRole,
  DeleteTeam,
  GetBranch,
  GetFavoriteIds,
  GetRole,
  GetTeam,
  GetUserPermissions,
  ListBranches,
  ListRoles,
  ListTeams,
  ListUsers,
  MakeMainBranch,
  ReactivateUser,
  ResetUserPassword,
  ResetUserTwoFactor,
  RemoveFavorites,
  RemoveTeamMember,
  ResolveSessionActor,
  RestoreBranch,
  RestoreRole,
  RestoreTeam,
  SetUserPermissions,
  SuspendUser,
  UpdateBranch,
  UpdateRole,
  UpdateTeam,
  UpdateUser,
  MoveMergedClientFavorites,
  RemoveErasedClientFavorites,
} from '@norde/core/identity';
import {
  ChangeClientTags,
  CheckClientDuplicates,
  CreateClient,
  CreateClientTag,
  CreateClientTagGroup,
  DeleteClient,
  DeleteClientTag,
  DeleteClientTagGroup,
  EraseClientData,
  ExportClients,
  GetClientImport,
  ListClientImportProblems,
  ListClientImports,
  PreviewClientImport,
  StartClientImport,
  GetClientDetail,
  LinkClients,
  ListClientHistory,
  ListClientLetters,
  ListClientRelations,
  ListClients,
  ListClientTagGroups,
  MergeClients,
  AddClientNote,
  CreateSavedSearch,
  DeleteSavedSearch,
  FeatureProperties,
  GetSavedSearch,
  RestoreSavedSearch,
  SetFeaturedAutoSend,
  UpdateSavedSearch,
  type SavedSearchLocations,
  GetFeaturedPropertyIds,
  ListClientActivity,
  ListClientFeatured,
  ListClientOpportunities,
  ListClientSavedSearches,
  UnfeatureProperty,
  ListClientSends,
  RevokeSharedListing,
  SendListings,
  type PublicListings,
  type FollowUpListings,
  MergeClientTags,
  PreviewClientMerge,
  ListPropertyInterestedClients,
  ListPropertySends,
  ReassignClient,
  RenameClientTagGroup,
  RestoreClient,
  SearchClientTags,
  UnlinkClients,
  UpdateClientDetails,
  UpdateClientTag,
  CreateCloseReason,
  CreateOpportunityStage,
  DeactivateCloseReason,
  DeactivateOpportunityStage,
  GetOpportunityConfiguration,
  ReactivateCloseReason,
  ReactivateOpportunityStage,
  ReorderCloseReasons,
  ReorderOpportunityStages,
  UpdateCloseReason,
  UpdateOpportunitySettings,
  UpdateOpportunityStage,
  ListOpportunities,
  ListOpportunityHistory,
  BulkUpdateOpportunities,
  GetOpportunityBulkOperation,
  UpdateOpportunityReferral,
  CountOpportunitiesByStage,
  CountPendingOpportunities,
  ChangeOpportunityStage,
  MarkOpportunityContacted,
  CloseOpportunity,
  ReassignOpportunity,
  AssignInquiry,
  CountInquiriesByTab,
  CountPendingInquiries,
  CreateInquiryRule,
  DeleteInquiry,
  DeleteInquiryRule,
  GetInquiryRule,
  ListInquiries,
  ListInquiryMatches,
  ListInquiryRules,
  MoveInquiryRule,
  RestoreInquiry,
  SetInquiryRuleActive,
  CreateQuickReply,
  DeleteQuickReply,
  GetQuickReply,
  ListQuickReplies,
  SetQuickReplyActive,
  UpdateQuickReply,
  UpdateInquiryRule,
  ApplyOpportunityRules,
  MatchFollowUps,
  NotifyTeamOfOpportunity,
  FindReceivedInquiries,
  ReceiveInquiry,
  RecordClientActivity,
  RouteInquiry,
  RunClientImport,
  RunOpportunityBulkOperation,
  type ClientAgents,
  type ClientImportAgents,
  FindOrCreateOwner,
  type ClientListings,
  type InquiryPropertyLookup,
  type OpportunityRequesters,
  type PropertyProfiles,
  type ReceiveInquiryError,
  type ReceiveInquiryInput,
  type ReceiveInquiryOutput,
} from '@norde/core/clients';
import { EraseClientConversations, MoveMergedClientConversations } from '@norde/core/conversations';
import {
  CountUnreadNotifications,
  ListNotifications,
  MarkAllNotificationsRead,
  MarkNotificationRead,
  MoveMergedClientNotifications,
  NotifyAssignment,
  RemoveErasedClientNotifications,
} from '@norde/core/notifications';
import {
  AddMediaLink,
  BulkEditProperties,
  ChangePropertyCode,
  ChangePropertyProducer,
  AddPropertyOwner,
  RemovePropertyOwner,
  ChangePropertyStatus,
  ChangePropertyTags,
  CompareProperties,
  FindDevelopmentsByCode,
  FindPropertiesByCode,
  GetPropertyDetail,
  GetPropertySummaries,
  ListOwnedProperties,
  CreateCustomAttribute,
  DeleteAttachment,
  DeleteMedia,
  GetPanelPropertyDetail,
  GetAttachmentDownload,
  GetPropertyDocumentDownload,
  GetPropertyInterestProfile,
  GetPropertyInterestProfiles,
  GetPropertyFollowUpProfile,
  GetMediaFile,
  ListShareablePhotos,
  ListCustomAttributes,
  ListAttachments,
  ListPropertyDocuments,
  ListPropertyHistory,
  ListMedia,
  ReorderMedia,
  RequestPropertyDocument,
  SendOwnerReport,
  SetMediaCover,
  UpdateCustomAttribute,
  UpdateAttachment,
  UpdatePropertyCharacteristics,
  UpdatePropertyCustomAttributes,
  UpdatePropertyDeal,
  UpdatePropertyDescription,
  UpdatePropertyFeatures,
  UpdatePropertyInternalInfo,
  UpdatePropertyLocation,
  UpdateMedia,
  UpdatePropertyOperations,
  UpdatePropertyPublication,
  UploadAttachment,
  UploadMedia,
  CreateFeature,
  CreateLocation,
  CreateProperty,
  CreateTag,
  CreateTagGroup,
  DeleteFavoriteSearch,
  DeleteProperty,
  FallReservation,
  ExportReservations,
  GetActiveReservation,
  ListPropertyReservations,
  ListReservations,
  ReserveProperty,
  SignReservation,
  UpdateReservation,
  DeleteTag,
  DeleteTagGroup,
  ExportProperties,
  GetPropertyConfiguration,
  GetPropertyMap,
  ListFavoriteSearches,
  ListFeatures,
  ListPanelProperties,
  ListTagGroups,
  ChangeDevelopmentStatus,
  ChangeDevelopmentTags,
  CreateDevelopment,
  CreateDevelopmentUnit,
  ExportDevelopmentUnits,
  GetDevelopmentUnitImport,
  ListDevelopmentUnitImportProblems,
  ListDevelopmentUnitImports,
  PreviewDevelopmentUnitImport,
  StartDevelopmentUnitImport,
  DeleteDevelopment,
  GetDevelopmentDetail,
  GetDevelopmentMap,
  ListDevelopmentHistory,
  ListDevelopments,
  RestoreDevelopment,
  UpdateDevelopmentDetails,
  UpdateDevelopmentChances,
  UpdateDevelopmentFeatures,
  UpdateDevelopmentGeneral,
  UpdateDevelopmentLocation,
  type DevelopmentCodeAllocator,
  CreatePropertyFromAppraisal,
  DeleteStoredMediaFiles,
  GenerateMediaVariants,
  MoveMergedClientLinks,
  RenderPropertyDocument,
  RevalidatePublicDevelopment,
  RevalidatePublicProperty,
  RunDevelopmentUnitImport,
  RunPropertyImport,
  RunTokkoApiPropertyImport,
  PreviewPropertyImport,
  StartPropertyImport,
  StartTokkoApiPropertyImport,
  ListPropertyImports,
  GetPropertyImport,
  ListPropertyImportProblems,
  type PropertyImportDirectory,
  UnlinkErasedClients,
  type OwnerReports,
  RenameLocation,
  RenameTagGroup,
  RestoreProperty,
  SaveFavoriteSearch,
  SearchLocations,
  SearchTags,
  UpdateFeature,
  UpdateGridColumns,
  UpdatePropertyTypeSetting,
  UpdateTag,
  type Producers,
  type ReferenceCodeAllocator,
  type UserNames,
} from '@norde/core/properties';
import {
  CountBackgroundTasks,
  GetOwnerReport,
  GetPendingOpportunities,
  GetPortalAlerts,
  GetPortfolioSummary,
  GetPropertyStatistics,
  GetPublicationOverview,
  GetUnassignedInquiries,
  GetUpcomingSignings,
  GlobalSearch,
  ListAvailableDevelopments,
  ListAvailableProperties,
  ListBackgroundTasks,
  ListPortalPublications,
  type ReportingPropertyProfiles,
} from '@norde/core/reporting';
import {
  AllocateReferenceCode,
  ChangeCompanyLogo,
  ChangeReferenceCodePrefix,
  ChangeWatermarkLogo,
  ConfigureWatermark,
  CreateFolder,
  CreateReferenceCodeSequence,
  DeleteFolder,
  DeleteReferenceCodeSequence,
  GetCompanyBrand,
  GetCompanyFileDownload,
  GetCompanyLogo,
  GetCompanySettings,
  ListFolderContents,
  ListReferenceCodeSequences,
  ListTrashedFiles,
  MoveCompanyFileToTrash,
  PreviewWatermark,
  RenameCompanyFile,
  RenameFolder,
  RestoreCompanyFile,
  SearchDirectory,
  SendTestEmail,
  UpdateEmailSender,
  UpdateGeneralSettings,
  UpdatePdfOptions,
  UpdatePortalDescriptionFooter,
  UploadCompanyFile,
  type FileStorage,
} from '@norde/core/settings';
import {
  ChangeListingPlan,
  ChangeListingType,
  ConnectPortalAccount,
  ConnectPortalAccountWithCode,
  DisconnectPortalAccount,
  GetDevelopmentListings,
  GetPortalCredits,
  GetListingStats,
  GetPortalPackages,
  GetPropertyListings,
  EnablePortalLeadNotifications,
  LinkDevelopmentListing,
  LinkPortalListing,
  NotifyAccountLeads,
  NotifyListingChanged,
  NotifyPortalLeads,
  PullPortalLeads,
  ReconcileListing,
  ReconcileListings,
  ListPortalAccounts,
  ListRemoteDevelopments,
  ListRemoteListings,
  PauseListing,
  RequestDevelopmentPublication,
  RequestAllListingsSync,
  RequestListingSync,
  RequestPublication,
  ResumeListing,
  ResyncListing,
  SetPortalAccountEnabled,
  StartPortalConnection,
  SyncListing,
  UnpublishListing,
} from '@norde/core/portals';
import { Actor, err, ok, type Clock, type IdGenerator, type Result } from '@norde/core/shared';
import {
  BetterAuthPasswordHasher,
  BetterAuthSessionReader,
  createAuth,
  createClientsUnitOfWork,
  createDatabase,
  createIdentityUnitOfWork,
  createPropertiesUnitOfWork,
  createSettingsUnitOfWork,
  DrizzleAuditHistoryQuery,
  DrizzleAuditLog,
  DrizzleClientListQuery,
  DrizzleOpportunityPipelineQuery,
  DrizzleInquiryInboxQuery,
  DrizzleInquiryMatchQuery,
  DrizzleInquiryRuleQuery,
  DrizzleQuickReplyQuery,
  DrizzleClientRelationQuery,
  DrizzleClientRecordQuery,
  DrizzleClientSendsQuery,
  DrizzlePropertySearchQuery,
  HtmlSharedListingEmails,
  RandomSharedListingTokens,
  DrizzleClientTagQuery,
  DrizzleCompanyFileRepository,
  DrizzleCompanyFilesQuery,
  DrizzleCompanySettingsRepository,
  DrizzleDirectory,
  DrizzleNewsFeedQuery,
  DrizzleOrganizationQuery,
  DrizzlePanelPropertyListQuery,
  DrizzleDevelopmentListQuery,
  DrizzlePropertyCatalogQuery,
  DrizzlePropertyDetailLookups,
  DrizzlePropertyDocumentQuery,
  DrizzlePropertyReservationsQuery,
  DrizzleReservationListQuery,
  DrizzlePropertyInterestQuery,
  DrizzleFollowUpCandidatesQuery,
  DrizzleMediaQuery,
  DrizzlePropertyStatisticsQuery,
  DrizzleHomeDashboardQuery,
  DrizzlePublicationOverviewQuery,
  DrizzleBackgroundTaskQuery,
  DrizzleNotifications,
  DrizzleReferenceCodeSequenceQuery,
  DrizzleRoleListQuery,
  DrizzleUserAccessQuery,
  DrizzleUserFavorites,
  DrizzleUserListQuery,
  FilePropertyExportWriter,
  DrizzleDevelopmentUnitImportQuery,
  DrizzlePropertyImportQuery,
  XlsxDevelopmentUnitsExportWriter,
  XlsxReservationExportWriter,
  LocalFileStorage,
  NominatimGeocoder,
  ResendMailer,
  S3FileStorage,
  SharpImageWatermarker,
  SystemClock,
  UuidV7IdGenerator,
  XlsxClientExportWriter,
  UploadedSpreadsheetReader,
  TokkoPropertyApi,
  XlsxSpreadsheetReader,
  DrizzleClientImportQuery,
  type Database,
  type DatabaseConnection,
  createAppraisalsUnitOfWork,
  DrizzleAppraisalQuery,
  PdfLibAppraisalReportRenderer,
  createConversationsUnitOfWork,
  DrizzleClientConversationErasure,
  DrizzleClientFavoriteErasure,
  DrizzleClientRepository,
  DrizzleOpportunityRepository,
  DrizzlePropertyClientErasure,
  LogPublicSite,
  LogTeamNotifier,
  OutboxRelay,
  PdfLibPropertyDocumentRenderer,
  PgBossEventBus,
  SharpImageVariantGenerator,
  WebhookPublicSite,
  WebhookTeamNotifier,
  AesGcmSecretCipher,
  createPortalsUnitOfWork,
  DrizzlePortalAccountRepository,
  DrizzlePortalListingCountsQuery,
  MercadoLibreAuthorizer,
  MercadoLibreAccountReader,
  MercadoLibreLeads,
  MercadoLibreListingCatalog,
  MercadoLibreLocations,
  MercadoLibrePortalConnector,
  MercadoLibreTokens,
  PortalConnectorsByProvider,
  PortalLeadSourcesByProvider,
  PortalListingCatalogsByProvider,
  PortalListingStatesByProvider,
  CachedPortalCredits,
  ZonapropAccountDirectory,
  ZonapropApi,
  ZonapropLeads,
  ZonapropListingStates,
  ZonapropListingCatalog,
  ZonapropLocations,
  ZonapropPortalConnector,
} from '@norde/infra';
import { nextCookies } from 'better-auth/next-js';
import type { Logger } from 'pino';

import {
  getEnv,
  mercadoLibreApp,
  zonapropApi,
  zonapropCallbackTarget,
  type Env,
} from './config/env';
import { getLogger } from './config/logger';
import { developmentCodeLookup } from './features/portals/development-code-lookup';
import { developmentListingSourceReader } from './features/portals/development-listing-source-reader';
import { listingSourceReader } from './features/portals/listing-source-reader';
import { portalLeadSink } from './features/portals/portal-lead-sink';
import { propertyCodeLookup } from './features/portals/property-code-lookup';
import {
  eventSubscriptions,
  pullPortalLeads,
  reconcilePortalListings,
} from './jobs/event-subscriptions';

export interface Container {
  readonly database: DatabaseConnection;
  readonly ids: IdGenerator;
  /** Endpoints de Better Auth (`/api/auth/*`): ingreso, salida y sesión. */
  readonly handleAuthRequest: (request: Request) => Promise<Response>;
  readonly sessions: BetterAuthSessionReader;
  readonly resolveSessionActor: ResolveSessionActor;
  readonly identity: {
    readonly listUsers: ListUsers;
    readonly listRoles: ListRoles;
    readonly createUser: CreateUser;
    /** Copiar los usuarios de Tokko (#17). */
    readonly startTokkoUsersImport: StartTokkoUsersImport;
    readonly updateUser: UpdateUser;
    readonly suspendUser: SuspendUser;
    readonly reactivateUser: ReactivateUser;
    readonly resetUserPassword: ResetUserPassword;
    readonly resetUserTwoFactor: ResetUserTwoFactor;
    readonly changeOwnPassword: ChangeOwnPassword;
    readonly getUserPermissions: GetUserPermissions;
    readonly setUserPermissions: SetUserPermissions;
    readonly getRole: GetRole;
    readonly createRole: CreateRole;
    readonly updateRole: UpdateRole;
    readonly deleteRole: DeleteRole;
    readonly restoreRole: RestoreRole;
    readonly listBranches: ListBranches;
    readonly getBranch: GetBranch;
    readonly createBranch: CreateBranch;
    readonly updateBranch: UpdateBranch;
    readonly makeMainBranch: MakeMainBranch;
    readonly deleteBranch: DeleteBranch;
    readonly restoreBranch: RestoreBranch;
    readonly listTeams: ListTeams;
    readonly getTeam: GetTeam;
    readonly createTeam: CreateTeam;
    readonly updateTeam: UpdateTeam;
    readonly deleteTeam: DeleteTeam;
    readonly restoreTeam: RestoreTeam;
    readonly addTeamMember: AddTeamMember;
    readonly removeTeamMember: RemoveTeamMember;
    readonly addFavorites: AddFavorites;
    readonly removeFavorites: RemoveFavorites;
    readonly getFavoriteIds: GetFavoriteIds;
  };
  /** Mi empresa: configuración, códigos de referencia y gestor de archivos (#4). */
  readonly settings: SettingsUseCases;
  /** Propiedades: buscador, alta, papelera, catálogos, mapa y acciones masivas (#5). */
  readonly properties: PropertiesUseCases;
  /** Agenda de contactos (#8) y lo que la ficha de propiedad muestra de ellos (#6). */
  readonly clients: ClientsUseCases;
  /** Estadísticas y reporte al propietario de la ficha (#6). */
  readonly reporting: ReportingUseCases;
  /** Bandeja de consultas de portales y de la web (#10). */
  readonly inquiries: InquiriesUseCases;
  /** Entrada de las consultas del formulario de apps/web: `ReceiveInquiry` como `system:web`. */
  readonly webInquiries: {
    readonly receive: (
      input: ReceiveInquiryInput,
    ) => Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>>;
  };
  /** Buscador de la barra superior: contactos, propiedades, emprendimientos y agentes. */
  readonly search: { readonly globalSearch: GlobalSearch };
  /** La campana de la barra superior: los procesos en segundo plano (ADR 0040). */
  readonly backgroundTasks: {
    readonly list: ListBackgroundTasks;
    readonly count: CountBackgroundTasks;
  };
  /** La campana de la barra superior: los avisos a quien entra (#112, ADR 0043). */
  readonly notifications: {
    readonly list: ListNotifications;
    readonly countUnread: CountUnreadNotifications;
    readonly markRead: MarkNotificationRead;
    readonly markAllRead: MarkAllNotificationsRead;
  };
  /** Tasaciones: listado, alta, edición, estados y papelera (#12). */
  readonly appraisals: AppraisalsUseCases;
  /** Noticias: el feed de actividad de la empresa (#16). */
  readonly news: { readonly listNews: ListNews };
  /** Difusión en portales (#14): cuentas de MercadoLibre. Sin `PORTALS_ENABLED`, no existe. */
  readonly portals: PortalsUseCases | undefined;
}

export type SettingsUseCases = ReturnType<typeof createSettingsUseCases>;
export type PropertiesUseCases = ReturnType<typeof createPropertiesUseCases>;
export type ClientsUseCases = ReturnType<typeof createDetailReadModels>['clients'] &
  ReturnType<typeof createClientsUseCases>;
export type ReportingUseCases = ReturnType<typeof createDetailReadModels>['reporting'];
export type InquiriesUseCases = ReturnType<typeof createInquiriesUseCases>;
export type AppraisalsUseCases = ReturnType<typeof createAppraisalsUseCases>;
export type PortalsUseCases = NonNullable<ReturnType<typeof createPortalsUseCases>>;

let container: Container | undefined;

/** Las consultas del formulario web: quedan creadas y auditadas por `system:web`. */
const WEB_ACTOR = Actor.system('web', ['inquiries:receive', 'properties:read']);
/** Los contactos de los avisos de los portales entran a la bandeja como `system:portal-sync`. */
const PORTAL_LEADS_ACTOR = Actor.system('portal-sync', ['inquiries:receive', 'properties:read']);
/** Los jobs que reaccionan a los eventos del outbox, con los permisos justos de cada uno. */
const SCHEDULER_ACTOR = Actor.system('scheduler', [
  'clients:read',
  'clients:record-activity',
  'properties:read',
  'properties:process-media',
  'properties:render-documents',
  'properties:revalidate-site',
  'appraisals:process-photos',
  'appraisals:erase-client-data',
  'conversations:erase-client-data',
  'properties:erase-client-data',
  'identity:erase-client-data',
  'notifications:erase-client-data',
  'appraisals:merge-client-data',
  'conversations:merge-client-data',
  'properties:merge-client-data',
  'identity:merge-client-data',
  'notifications:merge-client-data',
  'notifications:create',
  'opportunities:apply-rules',
  'opportunities:run-bulk',
  'clients:match-follow-ups',
  'inquiries:route',
]);
/**
 * Crea la propiedad de una tasación convertida. Es el scheduler, con lo justo: el código de
 * referencia sale de la numeración, que pide `properties:create`.
 */
const CONVERSION_ACTOR = Actor.system('scheduler', [
  'properties:create',
  'properties:create-from-appraisal',
]);
/**
 * Las importaciones desde planillas: contactos, unidades de emprendimientos y propiedades de Tokko.
 * Crear unidades pide un código de referencia, que entrega la numeración con `properties:create`;
 * las propiedades de Tokko crean a su propietario en contactos (`clients:create`).
 */
const IMPORT_ACTOR = Actor.system('import', [
  'clients:run-imports',
  'users:create',
  'clients:create',
  'properties:run-imports',
  'properties:create',
]);
/**
 * Sincroniza las publicaciones con los portales (#14). Lee la ficha (de la propiedad o del
 * emprendimiento y sus unidades), sus fotos, su sucursal y Mi empresa para armar el aviso.
 */
const PORTAL_SYNC_ACTOR = Actor.system('portal-sync', [
  'portals:sync',
  'properties:read',
  'developments:read',
  'settings:read',
  'branches:read',
]);
/** Arma el actor de quien pidió una acción masiva, con sus permisos de ahora. */
const REQUESTER_RESOLVER_ACTOR = Actor.system('auth', ['sessions:resolve']);

function createStorage(env: Env): FileStorage {
  if (env.STORAGE_DRIVER !== 's3') return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  // `getEnv` ya exigió estas variables con STORAGE_DRIVER=s3.
  return new S3FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? '',
    prefix: env.S3_PREFIX,
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  });
}

/**
 * Lo que comparten el panel y los jobs de portales (#14): la unidad de trabajo, el OAuth, los
 * conectores, el directorio y los contactos de Zonaprop, el lector de la propiedad y la bandeja de
 * consultas. Solo con `PORTALS_ENABLED`, que exige la clave de cifrado.
 */
function createPortalServices(
  db: Database,
  env: Env,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
  modules: { readonly properties: PropertiesUseCases; readonly settings: SettingsUseCases },
) {
  if (!env.PORTALS_ENABLED || env.PORTALS_SECRET_KEY === undefined) return undefined;
  const { clock } = deps;
  const logger = getLogger();
  const cipher = new AesGcmSecretCipher(env.PORTALS_SECRET_KEY);
  const uow = createPortalsUnitOfWork(db, { ...deps, cipher });
  const authorizer = new MercadoLibreAuthorizer({ app: mercadoLibreApp(env), clock, logger });
  const zonaprop = new ZonapropApi({
    config: zonapropApi(env),
    logger,
    now: () => clock.now().getTime(),
    userAgent: `NordeGestion/1.0${env.MAIL_FROM_ADDRESS ? ` (${env.MAIL_FROM_ADDRESS})` : ''}`,
  });
  const directory = new ZonapropAccountDirectory({ api: zonaprop, logger });
  const accounts = new DrizzlePortalAccountRepository(db, clock);
  const tokens = new MercadoLibreTokens({ db, cipher, authorizer, clock, logger });
  // El código de inmobiliaria de la cuenta conectada en Mi empresa → Portales.
  const zonapropAgencyCode = async () =>
    (await accounts.get('zonaprop')).toSnapshot().connection?.externalAccountId;
  const connector = new PortalConnectorsByProvider({
    mercadolibre: new MercadoLibrePortalConnector({
      tokens,
      locations: new MercadoLibreLocations({ logger, now: () => clock.now().getTime() }),
      logger,
    }),
    zonaprop: new ZonapropPortalConnector({
      api: zonaprop,
      locations: new ZonapropLocations({ api: zonaprop }),
      agencyCode: zonapropAgencyCode,
      logger,
    }),
  });
  const mercadoLibre = new MercadoLibreAccountReader({ tokens, logger });
  const states = new PortalListingStatesByProvider({
    mercadolibre: mercadoLibre,
    zonaprop: new ZonapropListingStates({ api: zonaprop, agencyCode: zonapropAgencyCode, logger }),
  });
  const branch = new GetBranch({ organization: new DrizzleOrganizationQuery(db) });
  const reader = listingSourceReader({
    propertyDetail: modules.properties.getPanelPropertyDetail,
    photos: modules.properties.listShareablePhotos,
    companySettings: modules.settings.getCompanySettings,
    branch,
    actor: PORTAL_SYNC_ACTOR,
  });
  const developments = developmentListingSourceReader({
    developmentDetail: modules.properties.getDevelopmentDetail,
    units: modules.properties.listPanelProperties,
    unit: reader,
    photos: modules.properties.listShareablePhotos,
    companySettings: modules.settings.getCompanySettings,
    branch,
    actor: PORTAL_SYNC_ACTOR,
    logger,
  });
  const zonapropCatalog = new ZonapropListingCatalog({ api: zonaprop, logger });
  const catalog = new PortalListingCatalogsByProvider({
    zonaprop: zonapropCatalog,
    mercadolibre: new MercadoLibreListingCatalog({ tokens, logger }),
  });
  const leads = new ZonapropLeads({ api: zonaprop, catalog: zonapropCatalog, logger });
  const findReceived = new FindReceivedInquiries({ uow: createClientsUnitOfWork(db, deps) });
  const sink = portalLeadSink(createInquiryIntake(db, deps, PORTAL_LEADS_ACTOR), {
    find: (input) => findReceived.execute(input, PORTAL_LEADS_ACTOR),
  });
  const codes = propertyCodeLookup({
    findByCode: modules.properties.findPropertiesByCode,
    actor: PORTAL_SYNC_ACTOR,
  });
  const developmentCodes = developmentCodeLookup({
    findByCode: modules.properties.findDevelopmentsByCode,
    actor: PORTAL_SYNC_ACTOR,
  });
  return {
    uow,
    authorizer,
    connector,
    directory,
    mercadoLibre,
    states,
    reader,
    developments,
    catalog,
    codes,
    developmentCodes,
    leads,
    leadSource: new PortalLeadSourcesByProvider({
      zonaprop: leads,
      mercadolibre: new MercadoLibreLeads({ tokens, logger }),
    }),
    sink,
  };
}

/** Cuentas y publicaciones de portales (#14). Sin `PORTALS_ENABLED`, no existe. */
function createPortalsUseCases(
  db: Database,
  env: Env,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
  modules: { readonly properties: PropertiesUseCases; readonly settings: SettingsUseCases },
) {
  const services = createPortalServices(db, env, deps, modules);
  if (!services) return undefined;
  const {
    uow,
    authorizer,
    connector,
    directory,
    mercadoLibre,
    reader,
    developments,
    catalog,
    codes,
    developmentCodes,
    leads,
  } = services;
  const { ids, clock } = deps;
  const accounts = new DrizzlePortalAccountRepository(db, clock);

  return {
    listAccounts: new ListPortalAccounts({
      accounts,
      counter: new DrizzlePortalListingCountsQuery(db),
    }),
    // Solo para mostrar: recordados unos minutos (lo que consume créditos lee en vivo).
    getCredits: new GetPortalCredits({
      accounts,
      directory: new CachedPortalCredits(directory, () => clock.now().getTime()),
    }),
    getPackages: new GetPortalPackages({ accounts, reader: mercadoLibre }),
    getListingStats: new GetListingStats({ uow, reader: mercadoLibre, clock }),
    startConnection: new StartPortalConnection({ authorizer }),
    connectAccount: new ConnectPortalAccount({ uow, authorizer, clock }),
    connectAccountWithCode: new ConnectPortalAccountWithCode({ uow, directory, clock }),
    disconnectAccount: new DisconnectPortalAccount({ uow }),
    setAccountEnabled: new SetPortalAccountEnabled({ uow }),
    getPropertyListings: new GetPropertyListings({ uow }),
    requestPublication: new RequestPublication({ uow, reader, connector, directory, ids, clock }),
    listRemoteListings: new ListRemoteListings({ uow, catalog, properties: codes }),
    linkListing: new LinkPortalListing({ uow, catalog, reader, ids, clock }),
    getDevelopmentListings: new GetDevelopmentListings({ uow }),
    requestDevelopmentPublication: new RequestDevelopmentPublication({
      uow,
      developments,
      connector,
      directory,
      ids,
      clock,
    }),
    listRemoteDevelopments: new ListRemoteDevelopments({
      uow,
      catalog,
      developments: developmentCodes,
    }),
    linkDevelopmentListing: new LinkDevelopmentListing({ uow, catalog, developments, ids, clock }),
    /** El portal avisó que llegó un contacto (webhook): se pide leerlos. */
    notifyZonapropLeads: () =>
      new NotifyPortalLeads({ uow, clock }).execute({ portal: 'zonaprop' }, PORTAL_SYNC_ACTOR),
    /** MercadoLibre avisó que llegó un contacto a la cuenta `userId` (webhook): se pide leerlos. */
    notifyMercadoLibreLeads: (userId: string) =>
      new NotifyAccountLeads({ uow, clock }).execute(
        { provider: 'mercadolibre', externalAccountId: userId },
        PORTAL_SYNC_ACTOR,
      ),
    /** MercadoLibre avisó que cambió el aviso `itemId` de la cuenta `userId`: se pide conciliarlo. */
    notifyMercadoLibreItem: (userId: string, itemId: string) =>
      new NotifyListingChanged({ uow, clock }).execute(
        { provider: 'mercadolibre', externalAccountId: userId, remoteId: itemId },
        PORTAL_SYNC_ACTOR,
      ),
    enableLeadNotifications: new EnablePortalLeadNotifications({
      uow,
      notifications: leads,
      target: zonapropCallbackTarget(env),
    }),
    pauseListing: new PauseListing({ uow, clock }),
    resumeListing: new ResumeListing({ uow, directory, clock }),
    unpublishListing: new UnpublishListing({ uow, clock }),
    changeListingType: new ChangeListingType({ uow, clock }),
    changeListingPlan: new ChangeListingPlan({ uow, directory, clock }),
    resyncListing: new ResyncListing({ uow, clock }),
  };
}

function createSettingsUseCases(
  db: Database,
  env: Env,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
) {
  const { ids, clock } = deps;
  const uow = createSettingsUnitOfWork(db, deps);
  const storage = createStorage(env);
  const settings = new DrizzleCompanySettingsRepository(db, clock);
  const files = new DrizzleCompanyFilesQuery(db);
  const directory = new DrizzleDirectory(db);
  const mailer = new ResendMailer({
    apiKey: env.RESEND_API_KEY,
    fromAddress: env.MAIL_FROM_ADDRESS,
    logger: getLogger(),
  });

  return {
    getCompanySettings: new GetCompanySettings({ settings }),
    getCompanyLogo: new GetCompanyLogo({ settings, storage }),
    getCompanyBrand: new GetCompanyBrand({ settings }),
    updateGeneralSettings: new UpdateGeneralSettings({ uow, clock }),
    changeCompanyLogo: new ChangeCompanyLogo({ uow, storage, ids, clock }),
    configureWatermark: new ConfigureWatermark({ uow, clock }),
    changeWatermarkLogo: new ChangeWatermarkLogo({ uow, storage, ids, clock }),
    previewWatermark: new PreviewWatermark({
      settings,
      storage,
      watermarker: new SharpImageWatermarker(),
    }),
    updatePortalDescriptionFooter: new UpdatePortalDescriptionFooter({ uow, clock }),
    updatePdfOptions: new UpdatePdfOptions({ uow, clock }),
    updateEmailSender: new UpdateEmailSender({ uow, clock }),
    sendTestEmail: new SendTestEmail({ settings, mailer, uow }),
    listReferenceCodeSequences: new ListReferenceCodeSequences({
      sequences: new DrizzleReferenceCodeSequenceQuery(db),
      directory,
    }),
    searchDirectory: new SearchDirectory({ directory }),
    createReferenceCodeSequence: new CreateReferenceCodeSequence({ uow, ids }),
    changeReferenceCodePrefix: new ChangeReferenceCodePrefix({ uow }),
    deleteReferenceCodeSequence: new DeleteReferenceCodeSequence({ uow }),
    allocateReferenceCode: new AllocateReferenceCode({ uow }),
    listFolderContents: new ListFolderContents({ files }),
    listTrashedFiles: new ListTrashedFiles({ files }),
    getCompanyFileDownload: new GetCompanyFileDownload({
      files: new DrizzleCompanyFileRepository(db, clock),
      storage,
    }),
    createFolder: new CreateFolder({ uow, ids }),
    renameFolder: new RenameFolder({ uow }),
    deleteFolder: new DeleteFolder({ uow }),
    uploadCompanyFile: new UploadCompanyFile({ uow, storage, ids }),
    renameCompanyFile: new RenameCompanyFile({ uow }),
    moveCompanyFileToTrash: new MoveCompanyFileToTrash({ uow, clock }),
    restoreCompanyFile: new RestoreCompanyFile({ uow }),
  };
}

/**
 * El código de referencia de una propiedad nueva sale de la numeración de Mi empresa (settings).
 * Cualquier error de la numeración (falta configurarla, se agotó) se informa igual: no hay código.
 */
function referenceCodesFrom(settings: SettingsUseCases): ReferenceCodeAllocator {
  return {
    async allocate(request, actor) {
      const result = await settings.allocateReferenceCode.execute(
        {
          target: 'property',
          propertyType: request.kind,
          userId: request.producerUserId,
          branchId: request.branchId,
        },
        actor,
      );
      if (result.isErr()) {
        getLogger().warn(
          { error: result.error.type },
          'Could not allocate a property reference code',
        );
        return err({ type: 'ReferenceCodeUnavailable' });
      }
      return ok(result.value.code);
    },
  };
}

/** El código de un emprendimiento nuevo sale de la misma numeración de Mi empresa. */
function developmentCodesFrom(settings: SettingsUseCases): DevelopmentCodeAllocator {
  return {
    async allocate(request, actor) {
      const result = await settings.allocateReferenceCode.execute(
        { target: 'development', userId: request.producerUserId, branchId: request.branchId },
        actor,
      );
      if (result.isErr()) {
        getLogger().warn(
          { error: result.error.type },
          'Could not allocate a development reference code',
        );
        return err({ type: 'ReferenceCodeUnavailable' });
      }
      return ok(result.value.code);
    },
  };
}

function createPropertiesUseCases(
  db: Database,
  env: Env,
  settings: SettingsUseCases,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
) {
  const { ids, clock } = deps;
  const uow = createPropertiesUnitOfWork(db, deps);
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const list = new DrizzlePanelPropertyListQuery(db);
  const catalog = new DrizzlePropertyCatalogQuery(db);
  const users: UserNames = { names: (userIds) => directory.names('user', userIds) };
  // Captadores: usuarios activos de identity, con su sucursal.
  const producers: Producers = {
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
  const storage = createStorage(env);
  const lookups = new DrizzlePropertyDetailLookups(db);
  const reservations = new DrizzlePropertyReservationsQuery(db);
  const reservationList = new DrizzleReservationListQuery(db);
  const media = new DrizzleMediaQuery(db);
  const unitImports = new DrizzleDevelopmentUnitImportQuery(db);
  const propertyImports = new DrizzlePropertyImportQuery(db);
  const geocoder = new NominatimGeocoder({
    userAgent: env.GEOCODER_USER_AGENT,
    baseUrl: env.GEOCODER_URL,
    logger: getLogger(),
  });

  return {
    listPanelProperties: new ListPanelProperties({ properties: list, users, storage }),
    getPropertyMap: new GetPropertyMap({ properties: list }),
    compareProperties: new CompareProperties({ properties: list, users }),
    listOwnedProperties: new ListOwnedProperties({ properties: list, users }),
    getPropertySummaries: new GetPropertySummaries({ properties: list, users }),
    findPropertiesByCode: new FindPropertiesByCode({ properties: list, users }),
    findDevelopmentsByCode: new FindDevelopmentsByCode({
      developments: new DrizzleDevelopmentListQuery(db),
    }),
    createProperty: new CreateProperty({
      uow,
      codes: referenceCodesFrom(settings),
      geocoder,
      ids,
      clock,
    }),
    deleteProperty: new DeleteProperty({ uow, clock }),
    restoreProperty: new RestoreProperty({ uow, clock }),
    bulkEditProperties: new BulkEditProperties({ uow, list, producers, clock }),
    exportProperties: new ExportProperties({
      uow,
      list,
      users,
      writer: new FilePropertyExportWriter(),
      clock,
    }),
    getPropertyConfiguration: new GetPropertyConfiguration({ catalog }),
    updatePropertyTypeSetting: new UpdatePropertyTypeSetting({ uow, clock }),
    updateGridColumns: new UpdateGridColumns({ uow, clock }),
    searchLocations: new SearchLocations({ catalog }),
    createLocation: new CreateLocation({ uow, ids, clock }),
    renameLocation: new RenameLocation({ uow, clock }),
    listFeatures: new ListFeatures({ catalog }),
    createFeature: new CreateFeature({ uow, ids, clock }),
    updateFeature: new UpdateFeature({ uow, clock }),
    listTagGroups: new ListTagGroups({ catalog }),
    searchTags: new SearchTags({ catalog }),
    createTagGroup: new CreateTagGroup({ uow, ids, clock }),
    renameTagGroup: new RenameTagGroup({ uow, clock }),
    deleteTagGroup: new DeleteTagGroup({ uow }),
    createTag: new CreateTag({ uow, ids, clock }),
    updateTag: new UpdateTag({ uow, clock }),
    deleteTag: new DeleteTag({ uow }),
    listFavoriteSearches: new ListFavoriteSearches({ catalog }),
    saveFavoriteSearch: new SaveFavoriteSearch({ uow, ids, clock }),
    deleteFavoriteSearch: new DeleteFavoriteSearch({ uow }),

    // Ficha (#6)
    getPanelPropertyDetail: new GetPanelPropertyDetail({ uow, lookups, users }),
    updatePropertyLocation: new UpdatePropertyLocation({ uow, geocoder, clock }),
    changePropertyCode: new ChangePropertyCode({ uow, clock }),
    updatePropertyOperations: new UpdatePropertyOperations({ uow, clock }),
    changePropertyStatus: new ChangePropertyStatus({ uow, clock }),
    updatePropertyCharacteristics: new UpdatePropertyCharacteristics({ uow, clock }),
    updatePropertyDeal: new UpdatePropertyDeal({ uow, clock }),
    updatePropertyFeatures: new UpdatePropertyFeatures({ uow, clock }),
    updatePropertyDescription: new UpdatePropertyDescription({ uow, clock }),
    updatePropertyCustomAttributes: new UpdatePropertyCustomAttributes({ uow, clock }),
    changePropertyTags: new ChangePropertyTags({ uow, clock }),
    changePropertyProducer: new ChangePropertyProducer({ uow, producers, clock }),
    addPropertyOwner: new AddPropertyOwner({ uow }),
    removePropertyOwner: new RemovePropertyOwner({ uow }),
    updatePropertyInternalInfo: new UpdatePropertyInternalInfo({ uow, producers, clock }),
    updatePropertyPublication: new UpdatePropertyPublication({ uow, clock }),
    listCustomAttributes: new ListCustomAttributes({ catalog }),
    createCustomAttribute: new CreateCustomAttribute({ uow, ids, clock }),
    updateCustomAttribute: new UpdateCustomAttribute({ uow, clock }),
    listPropertyHistory: new ListPropertyHistory({
      uow,
      history: new DrizzleAuditHistoryQuery(db),
      users,
    }),
    getPropertyInterestProfile: new GetPropertyInterestProfile({ uow }),
    getPropertyInterestProfiles: new GetPropertyInterestProfiles({ uow }),
    getPropertyFollowUpProfile: new GetPropertyFollowUpProfile({ uow }),
    // Reservas (#13)
    reserveProperty: new ReserveProperty({ uow, producers, clock, ids }),
    updateReservation: new UpdateReservation({ uow, producers, clock }),
    fallReservation: new FallReservation({ uow, clock }),
    signReservation: new SignReservation({ uow, clock }),
    listPropertyReservations: new ListPropertyReservations({ reservations, users }),
    getActiveReservation: new GetActiveReservation({ reservations, users }),
    listReservations: new ListReservations({ reservations: reservationList, users }),
    exportReservations: new ExportReservations({
      uow,
      reservations: reservationList,
      users,
      writer: new XlsxReservationExportWriter(),
      clock,
    }),
    // Multimedia y archivos
    listMedia: new ListMedia({ media }),
    getMediaFile: new GetMediaFile({ uow, storage }),
    listShareablePhotos: new ListShareablePhotos({ uow, storage }),
    uploadMedia: new UploadMedia({ uow, storage, ids, clock }),
    addMediaLink: new AddMediaLink({ uow, ids, clock }),
    updateMedia: new UpdateMedia({ uow, clock }),
    reorderMedia: new ReorderMedia({ uow, clock }),
    setMediaCover: new SetMediaCover({ uow, clock }),
    deleteMedia: new DeleteMedia({ uow, clock }),
    listAttachments: new ListAttachments({ media, users }),
    uploadAttachment: new UploadAttachment({ uow, storage, ids, clock }),
    updateAttachment: new UpdateAttachment({ uow, clock }),
    deleteAttachment: new DeleteAttachment({ uow, clock }),
    getAttachmentDownload: new GetAttachmentDownload({ uow, storage }),
    // PDF
    requestPropertyDocument: new RequestPropertyDocument({ uow, ids, clock }),
    listPropertyDocuments: new ListPropertyDocuments({
      documents: new DrizzlePropertyDocumentQuery(db),
      users,
    }),
    getPropertyDocumentDownload: new GetPropertyDocumentDownload({ uow, storage }),
    // Emprendimientos (#7)
    listDevelopments: new ListDevelopments({
      developments: new DrizzleDevelopmentListQuery(db),
      users,
      storage,
    }),
    getDevelopmentMap: new GetDevelopmentMap({
      developments: new DrizzleDevelopmentListQuery(db),
    }),
    getDevelopmentDetail: new GetDevelopmentDetail({ uow, lookups, users }),
    listDevelopmentHistory: new ListDevelopmentHistory({
      uow,
      history: new DrizzleAuditHistoryQuery(db),
      users,
    }),
    createDevelopment: new CreateDevelopment({
      uow,
      codes: developmentCodesFrom(settings),
      geocoder,
      ids,
      clock,
    }),
    updateDevelopmentGeneral: new UpdateDevelopmentGeneral({ uow, clock }),
    updateDevelopmentLocation: new UpdateDevelopmentLocation({ uow, geocoder, clock }),
    updateDevelopmentDetails: new UpdateDevelopmentDetails({ uow, clock }),
    changeDevelopmentStatus: new ChangeDevelopmentStatus({ uow, clock }),
    updateDevelopmentFeatures: new UpdateDevelopmentFeatures({ uow, clock }),
    updateDevelopmentChances: new UpdateDevelopmentChances({ uow, agents: producers, clock }),
    changeDevelopmentTags: new ChangeDevelopmentTags({ uow, clock }),
    deleteDevelopment: new DeleteDevelopment({ uow, clock }),
    restoreDevelopment: new RestoreDevelopment({ uow, clock }),
    createDevelopmentUnit: new CreateDevelopmentUnit({
      uow,
      codes: referenceCodesFrom(settings),
      ids,
      clock,
    }),
    exportDevelopmentUnits: new ExportDevelopmentUnits({
      uow,
      list,
      users,
      writer: new XlsxDevelopmentUnitsExportWriter(),
      clock,
    }),
    previewDevelopmentUnitImport: new PreviewDevelopmentUnitImport({
      uow,
      reader: new XlsxSpreadsheetReader(),
    }),
    startDevelopmentUnitImport: new StartDevelopmentUnitImport({
      uow,
      reader: new XlsxSpreadsheetReader(),
      storage,
      ids,
      clock,
    }),
    listDevelopmentUnitImports: new ListDevelopmentUnitImports({
      uow,
      imports: unitImports,
      users,
    }),
    getDevelopmentUnitImport: new GetDevelopmentUnitImport({ uow, imports: unitImports, users }),
    listDevelopmentUnitImportProblems: new ListDevelopmentUnitImportProblems({
      uow,
      imports: unitImports,
    }),
    previewPropertyImport: new PreviewPropertyImport({ reader: new UploadedSpreadsheetReader() }),
    startPropertyImport: new StartPropertyImport({
      uow,
      reader: new UploadedSpreadsheetReader(),
      storage,
      ids,
      clock,
    }),
    startTokkoApiPropertyImport: new StartTokkoApiPropertyImport({
      uow,
      configured: env.TOKKO_API_KEY !== undefined,
      ids,
      clock,
    }),
    listPropertyImports: new ListPropertyImports({ imports: propertyImports, users }),
    getPropertyImport: new GetPropertyImport({ imports: propertyImports, users }),
    listPropertyImportProblems: new ListPropertyImportProblems({ imports: propertyImports }),
    sendOwnerReport: new SendOwnerReport({
      uow,
      storage,
      mailer: new ResendMailer({
        apiKey: env.RESEND_API_KEY,
        fromAddress: env.MAIL_FROM_ADDRESS,
        logger: getLogger(),
      }),
      settings: new DrizzleCompanySettingsRepository(db, clock),
    }),
  };
}

/** Agenda de contactos: grilla, ficha, alta, edición, papelera y exportación (#8). */
/** Las propiedades que muestran la ficha del contacto y la bandeja, por la API pública de properties. */
function clientListings(properties: PropertiesUseCases): ClientListings {
  return {
    async summaries(propertyIds, actor) {
      const rows = await properties.getPropertySummaries.execute({ ids: [...propertyIds] }, actor);
      if (rows.isErr()) return new Map();
      return new Map(
        rows.value.map((row) => [
          row.id,
          {
            id: row.id,
            code: row.code,
            title: row.portalTitle,
            address: row.publishAddress,
            status: row.status,
            operations: row.operations,
            cover: row.cover,
            producer: row.producer,
          },
        ]),
      );
    },
  };
}

/** El perfil de cruce de las propiedades (para interesados y coincidencias), por la API de properties. */
function propertyProfiles(properties: PropertiesUseCases): PropertyProfiles {
  return {
    async find(propertyId, actor) {
      const profile = await properties.getPropertyInterestProfile.execute({ propertyId }, actor);
      return profile.isOk() ? profile.value : undefined;
    },
    async findMany(propertyIds, actor) {
      const profiles = await properties.getPropertyInterestProfiles.execute(
        { propertyIds: [...propertyIds] },
        actor,
      );
      if (profiles.isErr()) return new Map();
      return new Map(profiles.value.map((profile) => [profile.propertyId, profile]));
    },
  };
}

/**
 * El perfil de una propiedad para los seguimientos automáticos (#106), por la API de properties.
 * Lo lee el job del cruce, como el sistema.
 */
function followUpListings(properties: PropertiesUseCases): FollowUpListings {
  return {
    async find(propertyId) {
      const profile = await properties.getPropertyFollowUpProfile.execute(
        { propertyId },
        SCHEDULER_ACTOR,
      );
      return profile.isOk() ? profile.value : undefined;
    },
  };
}

/** Los nombres de las ubicaciones de una búsqueda guardada, del catálogo de properties. */
function savedSearchLocations(properties: PropertiesUseCases): SavedSearchLocations {
  return {
    async labels(ids, actor) {
      const page = await properties.searchLocations.execute(
        { ids: [...ids], pageSize: Math.max(ids.length, 1) },
        actor,
      );
      if (page.isErr()) return new Map();
      return new Map(
        page.value.items.map((location) => [
          location.id,
          {
            id: location.id,
            name: location.name,
            // De lo más cercano a lo más general: "CABA, Argentina".
            hint:
              location.ancestors.length === 0
                ? undefined
                : [...location.ancestors].reverse().join(', '),
          },
        ]),
      );
    },
  };
}

/** La bandeja de consultas (#10): las de portales y de la web, pendientes, asignadas y borradas. */
function createInquiriesUseCases(
  db: Database,
  properties: PropertiesUseCases,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
) {
  const { ids, clock } = deps;
  const uow = createClientsUnitOfWork(db, deps);
  const inbox = new DrizzleInquiryInboxQuery(db);
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const agents: ClientAgents = {
    names: (userIds) => directory.names('user', userIds),
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
  return {
    listInquiries: new ListInquiries({
      inbox,
      listings: clientListings(properties),
      agents,
      branches: { names: (branchIds) => directory.names('branch', branchIds) },
    }),
    countPendingInquiries: new CountPendingInquiries({ inbox }),
    countInquiriesByTab: new CountInquiriesByTab({ inbox }),
    deleteInquiry: new DeleteInquiry({ uow, clock }),
    restoreInquiry: new RestoreInquiry({ uow, clock }),
    listInquiryMatches: new ListInquiryMatches({
      uow,
      matches: new DrizzleInquiryMatchQuery(db),
      agents,
    }),
    assignInquiry: new AssignInquiry({ uow, agents, ids, clock }),
    listInquiryRules: new ListInquiryRules({
      rules: new DrizzleInquiryRuleQuery(db),
      agents,
      listings: clientListings(properties),
    }),
    getInquiryRule: new GetInquiryRule({ uow, agents, listings: clientListings(properties) }),
    createInquiryRule: new CreateInquiryRule({ uow, agents, ids, clock }),
    updateInquiryRule: new UpdateInquiryRule({ uow, agents, clock }),
    setInquiryRuleActive: new SetInquiryRuleActive({ uow, clock }),
    moveInquiryRule: new MoveInquiryRule({ uow, clock }),
    deleteInquiryRule: new DeleteInquiryRule({ uow }),
  };
}

function createAppraisalsUseCases(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock; readonly storage: FileStorage },
) {
  const { ids, clock, storage } = deps;
  const uow = createAppraisalsUnitOfWork(db, { ids, clock });
  const appraisals = new DrizzleAppraisalQuery(db);
  const names = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const directory: PanelDirectory = { names: (kind, entityIds) => names.names(kind, entityIds) };
  // Productores y tasadores: usuarios activos de identity, con su sucursal.
  const users: ActiveUsers = {
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
  return {
    listAppraisals: new ListAppraisals({ appraisals, directory }),
    getAppraisal: new GetAppraisal({ appraisals, directory }),
    getSourceAppraisal: new GetSourceAppraisal({ appraisals, directory }),
    listAppraisalHistory: new ListAppraisalHistory({
      appraisals,
      history: new DrizzleAuditHistoryQuery(db),
      directory,
    }),
    createAppraisal: new CreateAppraisal({ uow, users, clock, ids }),
    updateAppraisal: new UpdateAppraisal({ uow, users, clock }),
    changeAppraisalStatus: new ChangeAppraisalStatus({ uow, clock }),
    deleteAppraisal: new DeleteAppraisal({ uow, clock }),
    restoreAppraisal: new RestoreAppraisal({ uow, clock }),
    recordAppraisalResult: new RecordAppraisalResult({ uow, clock }),
    uploadAppraisalPhoto: new UploadAppraisalPhoto({ uow, storage, ids, clock }),
    deleteAppraisalPhoto: new DeleteAppraisalPhoto({ uow, clock }),
    getAppraisalPhotoFile: new GetAppraisalPhotoFile({ uow, storage }),
    convertAppraisalToListing: new ConvertAppraisalToListing({ uow, ids, clock }),
    downloadAppraisalReport: new DownloadAppraisalReport({
      uow,
      appraisals,
      directory,
      storage,
      settings: new DrizzleCompanySettingsRepository(db, clock),
      renderer: new PdfLibAppraisalReportRenderer(),
      clock,
    }),
  };
}

/**
 * Lo que el sitio público muestra (#104): un envío solo lleva propiedades que el cliente puede
 * abrir. Se pregunta como la web, con su actor.
 */
function publicListings(db: Database): PublicListings {
  const detail = new GetPropertyDetail({ properties: new DrizzlePropertySearchQuery(db) });
  const web = Actor.system('web', ['properties:read']);
  return {
    async unlisted(propertyIds) {
      const results = await Promise.all(
        propertyIds.map(async (propertyId) => ({
          propertyId,
          listed: (await detail.execute({ propertyId }, web)).isOk(),
        })),
      );
      return results.filter((r) => !r.listed).map((r) => r.propertyId);
    },
  };
}

function createClientsUseCases(
  db: Database,
  env: Env,
  properties: PropertiesUseCases,
  deps: { readonly ids: IdGenerator; readonly clock: Clock; readonly storage: FileStorage },
) {
  const { ids, clock, storage } = deps;
  const uow = createClientsUnitOfWork(db, { ids, clock });
  const reader = new UploadedSpreadsheetReader();
  const imports = new DrizzleClientImportQuery(db);
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  // Agentes: usuarios activos de identity, con su sucursal.
  const agents: ClientAgents = {
    names: (userIds) => directory.names('user', userIds),
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
  const list = new DrizzleClientListQuery(db);
  const tags = new DrizzleClientTagQuery(db);
  const records = new DrizzleClientRecordQuery(db);
  const pipeline = new DrizzleOpportunityPipelineQuery(db);
  const listings = clientListings(properties);
  return {
    listClients: new ListClients({ list, agents }),
    listClientLetters: new ListClientLetters({ list }),
    getClientDetail: new GetClientDetail({ uow, agents, tags, records }),
    listClientHistory: new ListClientHistory({
      uow,
      history: new DrizzleAuditHistoryQuery(db),
      agents,
    }),
    checkClientDuplicates: new CheckClientDuplicates({ uow, agents }),
    createClient: new CreateClient({ uow, agents, ids, clock }),
    updateClientDetails: new UpdateClientDetails({ uow, clock }),
    reassignClient: new ReassignClient({ uow, agents, clock }),
    deleteClient: new DeleteClient({ uow, clock }),
    restoreClient: new RestoreClient({ uow, clock }),
    listClientTagGroups: new ListClientTagGroups({ tags }),
    searchClientTags: new SearchClientTags({ tags }),
    createClientTagGroup: new CreateClientTagGroup({ uow, ids, clock }),
    renameClientTagGroup: new RenameClientTagGroup({ uow, clock }),
    deleteClientTagGroup: new DeleteClientTagGroup({ uow }),
    createClientTag: new CreateClientTag({ uow, ids, clock }),
    updateClientTag: new UpdateClientTag({ uow, clock }),
    deleteClientTag: new DeleteClientTag({ uow }),
    mergeClientTags: new MergeClientTags({ uow, clock }),
    changeClientTags: new ChangeClientTags({ uow, clock }),
    listClientRelations: new ListClientRelations({
      uow,
      relations: new DrizzleClientRelationQuery(db),
    }),
    linkClients: new LinkClients({ uow, clock }),
    unlinkClients: new UnlinkClients({ uow, clock }),
    previewClientMerge: new PreviewClientMerge({ uow, agents }),
    mergeClients: new MergeClients({ uow, ids, clock }),
    // Ficha completa (etapa 3)
    listClientActivity: new ListClientActivity({ uow, records, agents }),
    addClientNote: new AddClientNote({ uow, ids, clock }),
    listClientOpportunities: new ListClientOpportunities({ uow, records, agents }),
    listClientFeatured: new ListClientFeatured({ uow, records, listings, agents }),
    listClientSavedSearches: new ListClientSavedSearches({ uow, records }),
    getFeaturedPropertyIds: new GetFeaturedPropertyIds({ uow, records }),
    featureProperties: new FeatureProperties({
      uow,
      listings,
      profiles: propertyProfiles(properties),
      ids,
      clock,
    }),
    unfeatureProperty: new UnfeatureProperty({ uow, clock }),
    setFeaturedAutoSend: new SetFeaturedAutoSend({ uow, clock }),
    // Envíos por email o WhatsApp y su página pública (#104)
    sendListings: new SendListings({
      uow,
      listings,
      publicListings: publicListings(db),
      tokens: new RandomSharedListingTokens(),
      emails: new HtmlSharedListingEmails(),
      mailer: new ResendMailer({
        apiKey: env.RESEND_API_KEY,
        fromAddress: env.MAIL_FROM_ADDRESS,
        logger: getLogger(),
      }),
      settings: new DrizzleCompanySettingsRepository(db, clock),
      agents,
      siteUrl: env.PUBLIC_SITE_URL,
      ids,
      clock,
    }),
    revokeSharedListing: new RevokeSharedListing({ uow, clock }),
    // Respuestas rápidas (#105)
    listQuickReplies: new ListQuickReplies({ replies: new DrizzleQuickReplyQuery(db) }),
    getQuickReply: new GetQuickReply({ uow }),
    createQuickReply: new CreateQuickReply({ uow, ids, clock }),
    updateQuickReply: new UpdateQuickReply({ uow, clock }),
    setQuickReplyActive: new SetQuickReplyActive({ uow, clock }),
    deleteQuickReply: new DeleteQuickReply({ uow }),
    listClientSends: new ListClientSends({
      uow,
      sends: new DrizzleClientSendsQuery(db),
      listings,
      agents,
      clock,
    }),
    // Búsquedas guardadas (#11)
    getSavedSearch: new GetSavedSearch({ uow, locations: savedSearchLocations(properties) }),
    createSavedSearch: new CreateSavedSearch({ uow, ids, clock }),
    updateSavedSearch: new UpdateSavedSearch({ uow, clock }),
    deleteSavedSearch: new DeleteSavedSearch({ uow, clock }),
    restoreSavedSearch: new RestoreSavedSearch({ uow, clock }),
    exportClients: new ExportClients({
      uow,
      list,
      agents,
      writer: new XlsxClientExportWriter(),
      clock,
    }),
    // Importación y supresión (etapa 4)
    previewClientImport: new PreviewClientImport({ reader }),
    startClientImport: new StartClientImport({ uow, reader, storage, agents, ids, clock }),
    listClientImports: new ListClientImports({ imports, agents }),
    getClientImport: new GetClientImport({ imports, agents }),
    listClientImportProblems: new ListClientImportProblems({ imports }),
    eraseClientData: new EraseClientData({ uow, ids, clock }),
    // Configuración de oportunidades (#9)
    getOpportunityConfiguration: new GetOpportunityConfiguration({ uow }),
    createOpportunityStage: new CreateOpportunityStage({ uow, ids, clock }),
    updateOpportunityStage: new UpdateOpportunityStage({ uow, clock }),
    reorderOpportunityStages: new ReorderOpportunityStages({ uow, clock }),
    deactivateOpportunityStage: new DeactivateOpportunityStage({ uow, clock }),
    reactivateOpportunityStage: new ReactivateOpportunityStage({ uow, clock }),
    createCloseReason: new CreateCloseReason({ uow, ids, clock }),
    updateCloseReason: new UpdateCloseReason({ uow, clock }),
    reorderCloseReasons: new ReorderCloseReasons({ uow, clock }),
    deactivateCloseReason: new DeactivateCloseReason({ uow, clock }),
    reactivateCloseReason: new ReactivateCloseReason({ uow, clock }),
    updateOpportunitySettings: new UpdateOpportunitySettings({ uow, clock }),
    // Pipeline de oportunidades (#9, etapa 2)
    listOpportunities: new ListOpportunities({ uow, pipeline, agents, listings, clock }),
    listOpportunityHistory: new ListOpportunityHistory({ uow, records, agents }),
    bulkUpdateOpportunities: new BulkUpdateOpportunities({ uow, pipeline, agents, ids, clock }),
    getOpportunityBulkOperation: new GetOpportunityBulkOperation({ uow }),
    updateOpportunityReferral: new UpdateOpportunityReferral({ uow, clock }),
    countOpportunitiesByStage: new CountOpportunitiesByStage({ pipeline }),
    countPendingOpportunities: new CountPendingOpportunities({ pipeline }),
    changeOpportunityStage: new ChangeOpportunityStage({ uow, ids, clock }),
    markOpportunityContacted: new MarkOpportunityContacted({ uow, ids, clock }),
    closeOpportunity: new CloseOpportunity({ uow, ids, clock }),
    reassignOpportunity: new ReassignOpportunity({ uow, agents, clock }),
  };
}

/**
 * Interesados, envíos y estadísticas de la ficha. Cruzan la propiedad con los clientes: el perfil
 * de la propiedad (tipo, operaciones, ubicación) lo da el caso de uso de propiedades.
 */
function createDetailReadModels(
  db: Database,
  properties: PropertiesUseCases,
  deps: { readonly clock: Clock },
) {
  const directory = new DrizzleDirectory(db);
  const agents = { names: (userIds: readonly string[]) => directory.names('user', userIds) };
  const profiles: PropertyProfiles & ReportingPropertyProfiles = propertyProfiles(properties);
  const interest = new DrizzlePropertyInterestQuery(db);
  const statistics = new DrizzlePropertyStatisticsQuery(db);
  const home = new DrizzleHomeDashboardQuery(db);
  const publications = new DrizzlePublicationOverviewQuery(db);
  return {
    clients: {
      listPropertyInterestedClients: new ListPropertyInterestedClients({
        profiles,
        interest,
        agents,
      }),
      listPropertySends: new ListPropertySends({ interest, agents }),
    },
    reporting: {
      getPropertyStatistics: new GetPropertyStatistics({ profiles, statistics, clock: deps.clock }),
      getOwnerReport: new GetOwnerReport({ profiles, statistics }),
      // Inicio (#15): un caso de uso por widget, cada uno con su límite.
      getUnassignedInquiries: new GetUnassignedInquiries({ home, clock: deps.clock }),
      getPendingOpportunities: new GetPendingOpportunities({
        home,
        users: agents,
        clock: deps.clock,
      }),
      getPortalAlerts: new GetPortalAlerts({ home }),
      getUpcomingSignings: new GetUpcomingSignings({ home, users: agents, clock: deps.clock }),
      getPortfolioSummary: new GetPortfolioSummary({ home }),
      listAvailableProperties: new ListAvailableProperties({ home, users: agents }),
      listAvailableDevelopments: new ListAvailableDevelopments({ home, users: agents }),
      // Difusión (#114): el resumen y la pantalla de cada portal.
      getPublicationOverview: new GetPublicationOverview({ publications }),
      listPortalPublications: new ListPortalPublications({ publications }),
    },
  };
}

function createContainer(): Container {
  const env = getEnv();
  const database = createDatabase({ url: env.DATABASE_URL, applicationName: 'norde-gestion' });
  const ids = new UuidV7IdGenerator();
  const clock = new SystemClock();

  const auth = createAuth({
    db: database.db,
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    ids,
    audit: new DrizzleAuditLog(database.db, ids, clock),
    logger: getLogger(),
    // `nextCookies` va último: deja escribir la cookie de sesión desde Server Actions.
    plugins: [nextCookies()],
    rateLimit: env.NODE_ENV === 'production',
  });

  const identityUow = createIdentityUnitOfWork(database.db, { ids, clock });
  const hasher = new BetterAuthPasswordHasher();
  const userAccess = new DrizzleUserAccessQuery(database.db);
  const roleQuery = new DrizzleRoleListQuery(database.db);
  const organization = new DrizzleOrganizationQuery(database.db);
  const settings = createSettingsUseCases(database.db, env, { ids, clock });
  const properties = createPropertiesUseCases(database.db, env, settings, { ids, clock });
  const withAgenda = withClients(
    createDetailReadModels(database.db, properties, { clock }),
    createClientsUseCases(database.db, env, properties, {
      ids,
      clock,
      storage: createStorage(env),
    }),
  );
  const listUsers = new ListUsers({ users: new DrizzleUserListQuery(database.db) });

  return {
    database,
    ids,
    handleAuthRequest: (request) => auth.handler(request),
    sessions: new BetterAuthSessionReader(auth),
    resolveSessionActor: new ResolveSessionActor({ users: userAccess }),
    settings,
    properties,
    inquiries: createInquiriesUseCases(database.db, properties, { ids, clock }),
    webInquiries: createInquiryIntake(database.db, { ids, clock }, WEB_ACTOR),
    appraisals: createAppraisalsUseCases(database.db, { ids, clock, storage: createStorage(env) }),
    ...withAgenda,
    search: {
      globalSearch: new GlobalSearch({
        clients: withAgenda.clients.listClients,
        properties: properties.listPanelProperties,
        developments: properties.listDevelopments,
        agents: listUsers,
      }),
    },
    backgroundTasks: createBackgroundTasks(database.db, clock),
    notifications: createNotifications(database.db, clock),
    news: { listNews: createListNews(database.db, clock) },
    portals: createPortalsUseCases(database.db, env, { ids, clock }, { properties, settings }),
    identity: {
      listUsers,
      listRoles: new ListRoles({ roles: roleQuery }),
      createUser: new CreateUser({ uow: identityUow, hasher, ids, clock }),
      startTokkoUsersImport: new StartTokkoUsersImport({
        uow: identityUow,
        configured: env.TOKKO_API_KEY !== undefined,
        ids,
        clock,
      }),
      updateUser: new UpdateUser({ uow: identityUow, clock }),
      suspendUser: new SuspendUser({ uow: identityUow, clock }),
      reactivateUser: new ReactivateUser({ uow: identityUow, clock }),
      resetUserPassword: new ResetUserPassword({ uow: identityUow, hasher, clock }),
      resetUserTwoFactor: new ResetUserTwoFactor({ uow: identityUow }),
      changeOwnPassword: new ChangeOwnPassword({ uow: identityUow, hasher, clock }),
      getUserPermissions: new GetUserPermissions({ users: userAccess }),
      setUserPermissions: new SetUserPermissions({ uow: identityUow, clock }),
      getRole: new GetRole({ roles: roleQuery }),
      createRole: new CreateRole({ uow: identityUow, ids, clock }),
      updateRole: new UpdateRole({ uow: identityUow, clock }),
      deleteRole: new DeleteRole({ uow: identityUow, clock }),
      restoreRole: new RestoreRole({ uow: identityUow, clock }),
      listBranches: new ListBranches({ organization }),
      getBranch: new GetBranch({ organization }),
      createBranch: new CreateBranch({ uow: identityUow, ids, clock }),
      updateBranch: new UpdateBranch({ uow: identityUow, clock }),
      makeMainBranch: new MakeMainBranch({ uow: identityUow, clock }),
      deleteBranch: new DeleteBranch({ uow: identityUow, clock }),
      restoreBranch: new RestoreBranch({ uow: identityUow, clock }),
      listTeams: new ListTeams({ organization }),
      getTeam: new GetTeam({ organization }),
      createTeam: new CreateTeam({ uow: identityUow, ids, clock }),
      updateTeam: new UpdateTeam({ uow: identityUow, clock }),
      deleteTeam: new DeleteTeam({ uow: identityUow, clock }),
      restoreTeam: new RestoreTeam({ uow: identityUow, clock }),
      addTeamMember: new AddTeamMember({ uow: identityUow, clock }),
      removeTeamMember: new RemoveTeamMember({ uow: identityUow, clock }),
      addFavorites: new AddFavorites({ uow: identityUow, clock }),
      removeFavorites: new RemoveFavorites({ uow: identityUow }),
      getFavoriteIds: new GetFavoriteIds({ favorites: new DrizzleUserFavorites(database.db) }),
    },
  };
}

function createNotifications(db: Database, clock: Clock) {
  const notifications = new DrizzleNotifications(db);
  return {
    list: new ListNotifications({ notifications }),
    countUnread: new CountUnreadNotifications({ notifications }),
    markRead: new MarkNotificationRead({ notifications, clock }),
    markAllRead: new MarkAllNotificationsRead({ notifications, clock }),
  };
}

function createBackgroundTasks(db: Database, clock: Clock) {
  const tasks = new DrizzleBackgroundTaskQuery(db);
  const directory = new DrizzleDirectory(db);
  return {
    list: new ListBackgroundTasks({
      tasks,
      users: { names: (userIds) => directory.names('user', userIds) },
      clock,
    }),
    count: new CountBackgroundTasks({ tasks, clock }),
  };
}

function createListNews(db: Database, clock: Clock): ListNews {
  const settings = new DrizzleCompanySettingsRepository(db, clock);
  const directory = new DrizzleDirectory(db);
  return new ListNews({
    feed: new DrizzleNewsFeedQuery(db),
    settings: { scope: async () => (await settings.get()).toSnapshot().newsScope },
    users: { names: (userIds) => directory.names('user', userIds) },
  });
}

/** Suma la agenda de contactos a los read models de clientes de la ficha de propiedad. */
function withClients(
  readModels: ReturnType<typeof createDetailReadModels>,
  agenda: ReturnType<typeof createClientsUseCases>,
) {
  return { ...readModels, clients: { ...readModels.clients, ...agenda } };
}

/** Se crea al primer uso y se reutiliza durante toda la vida del proceso. */
export function getContainer(): Container {
  container ??= createContainer();
  return container;
}

/** Usuarios activos que pueden captar propiedades, con su sucursal. */
function activeProducers(db: Database): Producers {
  const userAccess = new DrizzleUserAccessQuery(db);
  return {
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
}

/**
 * Lo que la importación de propiedades de Tokko busca afuera de properties: productores por nombre
 * (identity), emprendimientos por nombre y el propietario, por el caso de uso de contactos.
 */
function propertyImportDirectory(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): PropertyImportDirectory {
  const producers = importAgents(db);
  const developments = new DrizzleDevelopmentListQuery(db);
  const owners = new FindOrCreateOwner({
    uow: createClientsUnitOfWork(db, deps),
    agents: activeAgents(db),
    ...deps,
  });
  return {
    async searchProducers(name) {
      const candidates = await producers.searchByName(name);
      return candidates.map(({ userId, name: userName, branchId }) => ({
        userId,
        name: userName,
        branchId,
      }));
    },
    async searchDevelopments(name) {
      const page = await developments.search({
        view: 'active',
        text: name,
        status: undefined,
        developmentType: undefined,
        constructionStatus: undefined,
        tagId: undefined,
        sort: { field: 'name', direction: 'asc' },
        offset: 0,
        limit: 20,
      });
      return page.items.map((item) => ({ id: item.id, name: item.name }));
    },
    async findOrCreateOwner(owner, actor) {
      const result = await owners.execute(owner, actor);
      // El job corre con `clients:create` (IMPORT_ACTOR): sin él es un error de configuración.
      if (result.isErr()) throw new Error(`Owner lookup failed: ${result.error.type}`);
      return result.value;
    },
  };
}

/**
 * Los usuarios por nombre, para la columna "Agente" de una importación de contactos y el productor
 * de una de propiedades: también los suspendidos, para que lo de los usuarios que ya no están en
 * Tokko quede a su nombre (#17).
 */
function importAgents(db: Database): ClientImportAgents {
  const users = new DrizzleUserListQuery(db);
  const search = (status: 'active' | 'suspended', text: string) =>
    users.search({
      status,
      text,
      branchId: undefined,
      teamId: undefined,
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 20,
    });
  return {
    async searchByName(name) {
      const pages = await Promise.all([search('active', name), search('suspended', name)]);
      return pages.flatMap((page) =>
        page.items.map((user) => ({
          userId: user.id,
          name: user.name,
          branchId: user.branch?.id,
        })),
      );
    },
  };
}

/** Los agentes activos (con su sucursal), para el reparto de consultas y las acciones masivas. */
function activeAgents(db: Database): ClientAgents {
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  return {
    names: (userIds) => directory.names('user', userIds),
    async find(userId) {
      const user = await userAccess.findByUserId(userId);
      return user?.status === 'active' ? { branchId: user.branchId } : undefined;
    },
  };
}

/** La entrada de consultas de la web (#10): `ReceiveInquiry` con los datos de la propiedad. */
/** `ReceiveInquiry` con un actor de ingreso: el de la web o el de los portales. */
function createInquiryIntake(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
  actor: Actor,
): Container['webInquiries'] {
  const directory = new DrizzleDirectory(db);
  const userAccess = new DrizzleUserAccessQuery(db);
  const summaries = new GetPropertySummaries({
    properties: new DrizzlePanelPropertyListQuery(db),
    users: { names: (userIds) => directory.names('user', userIds) },
  });
  // Por la API pública de properties; la sucursal de la propiedad es la de su captador.
  const properties: InquiryPropertyLookup = {
    async facts(propertyId) {
      const rows = await summaries.execute({ ids: [propertyId] }, actor);
      const row = rows.isOk() ? rows.value[0] : undefined;
      if (!row) return undefined;
      const producer = row.producer && (await userAccess.findByUserId(row.producer.id));
      return {
        branchId: producer?.branchId,
        propertyType: row.propertyType,
        operations: row.operations.map((o) => o.operation),
        neighborhood: row.neighborhood,
        developmentId: row.developmentId,
      };
    },
  };
  const receiveInquiry = new ReceiveInquiry({
    uow: createClientsUnitOfWork(db, deps),
    properties,
    ...deps,
  });
  return { receive: (input) => receiveInquiry.execute(input, actor) };
}

/** Las reglas automáticas de estado y las acciones masivas encoladas de oportunidades (#9). */
function createOpportunityJobs(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
) {
  const { ids, clock } = deps;
  const uow = createClientsUnitOfWork(db, deps);
  const resolveActor = new ResolveSessionActor({ users: new DrizzleUserAccessQuery(db) });
  // El job procesa como quien la pidió: si ya no está activo, no hay actor y la operación falla.
  const requesters: OpportunityRequesters = {
    async actorFor(userId) {
      const result = await resolveActor.execute({ userId }, REQUESTER_RESOLVER_ACTOR);
      return result.isOk() ? result.value.actor : undefined;
    },
  };
  return {
    applyRules: new ApplyOpportunityRules({ uow, ids, clock }),
    runBulk: new RunOpportunityBulkOperation({
      uow,
      pipeline: new DrizzleOpportunityPipelineQuery(db),
      agents: activeAgents(db),
      requesters,
      ids,
      clock,
    }),
  };
}

/** Los jobs de la ficha de propiedad: variantes de fotos, limpieza del storage y PDF (#6). */
function createPropertyJobs(
  db: Database,
  storage: FileStorage,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
) {
  const { clock } = deps;
  const uow = createPropertiesUnitOfWork(db, deps);
  const settings = new DrizzleCompanySettingsRepository(db, clock);
  const directory = new DrizzleDirectory(db);
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
    generateMediaVariants: new GenerateMediaVariants({
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
      users: { names: (userIds) => directory.names('user', userIds) },
      storage,
      settings,
      renderer: new PdfLibPropertyDocumentRenderer(),
      ownerReports,
      clock,
    }),
  };
}

/** El relay del outbox y los workers de pg-boss de este proceso (ADR 0021). */
export interface JobsRuntime {
  start(): Promise<void>;
  /** Corta el relay, espera los jobs en curso y libera las conexiones. */
  stop(): Promise<void>;
}

/** Outbox → pg-boss → un caso de uso por suscripción, con su propio pool de conexiones. */
/** Los avisos a la web (ADR 0023). Sin URL ni secreto, quedan en el log y la web se refresca sola. */
function siteRevalidation(env: Env, logger: Logger) {
  const site =
    env.WEB_REVALIDATE_URL && env.WEB_REVALIDATE_SECRET
      ? new WebhookPublicSite({ url: env.WEB_REVALIDATE_URL, secret: env.WEB_REVALIDATE_SECRET })
      : new LogPublicSite(logger);
  return {
    property: new RevalidatePublicProperty({ site }),
    development: new RevalidatePublicDevelopment({ site }),
  };
}

function createJobsRuntime(env: Env, logger: Logger): JobsRuntime {
  const database = createDatabase({ url: env.DATABASE_URL, applicationName: 'norde-gestion-jobs' });
  const { db } = database;
  const ids = new UuidV7IdGenerator();
  const clock = new SystemClock();
  const deps = { ids, clock };
  const storage = createStorage(env);
  const settings = createSettingsUseCases(db, env, deps);
  const referenceCodes = referenceCodesFrom(settings);
  const properties = createPropertiesUseCases(db, env, settings, deps);
  const portals = createPortalServices(db, env, deps, { properties, settings });

  const bus = new PgBossEventBus({
    connectionString: env.DATABASE_URL,
    applicationName: 'norde-gestion-jobs',
    logger,
  });
  const portalJobs = portals && {
    requestSync: new RequestListingSync({ uow: portals.uow, clock }),
    requestAll: new RequestAllListingsSync({ uow: portals.uow, clock }),
    sync: new SyncListing({ ...portals, clock }),
    propertySummaries: properties.getPropertySummaries,
    pullLeads: new PullPortalLeads({
      uow: portals.uow,
      source: portals.leadSource,
      sink: portals.sink,
      properties: portals.codes,
      clock,
    }),
    reconcile: new ReconcileListings({ uow: portals.uow, reader: portals.states, clock }),
    reconcileOne: new ReconcileListing({ uow: portals.uow, reader: portals.states, clock }),
    actor: PORTAL_SYNC_ACTOR,
  };
  // La migración desde Tokko (#17): sin API key, sus jobs fallan con un error claro.
  const tokkoApi =
    env.TOKKO_API_KEY === undefined
      ? undefined
      : new TokkoPropertyApi({ config: { apiKey: env.TOKKO_API_KEY }, logger });
  const notifications = new DrizzleNotifications(db);
  for (const subscription of eventSubscriptions({
    notifyTeam: new NotifyTeamOfOpportunity({
      clients: new DrizzleClientRepository(db, ids),
      opportunities: new DrizzleOpportunityRepository(db),
      notifier: env.TEAM_WEBHOOK_URL
        ? new WebhookTeamNotifier({ url: env.TEAM_WEBHOOK_URL, token: env.TEAM_WEBHOOK_TOKEN })
        : new LogTeamNotifier(logger),
    }),
    recordActivity: new RecordClientActivity({ uow: createClientsUnitOfWork(db, deps) }),
    notifyAssignment: new NotifyAssignment({ notifications, ids }),
    properties: createPropertyJobs(db, storage, deps),
    appraisals: {
      deletePhotoFiles: new DeleteAppraisalPhotoFiles({ storage }),
      createProperty: new CreatePropertyFromAppraisal({
        uow: createPropertiesUnitOfWork(db, deps),
        codes: referenceCodes,
        storage,
        ids,
        clock,
      }),
    },
    erasure: {
      appraisals: new EraseClientAppraisals({
        uow: createAppraisalsUnitOfWork(db, deps),
        storage,
      }),
      conversations: new EraseClientConversations({
        erasure: new DrizzleClientConversationErasure(db),
      }),
      properties: new UnlinkErasedClients({
        erasure: new DrizzlePropertyClientErasure(db),
        uow: createPropertiesUnitOfWork(db, deps),
        clock,
      }),
      favorites: new RemoveErasedClientFavorites({
        favorites: new DrizzleClientFavoriteErasure(db),
      }),
      notifications: new RemoveErasedClientNotifications({ notifications }),
    },
    merge: {
      appraisals: new MoveMergedClientAppraisals({ uow: createAppraisalsUnitOfWork(db, deps) }),
      conversations: new MoveMergedClientConversations({
        uow: createConversationsUnitOfWork(db, deps),
      }),
      properties: new MoveMergedClientLinks({ uow: createPropertiesUnitOfWork(db, deps) }),
      favorites: new MoveMergedClientFavorites({ uow: createIdentityUnitOfWork(db, deps) }),
      notifications: new MoveMergedClientNotifications({ notifications }),
    },
    runImport: new RunClientImport({
      uow: createClientsUnitOfWork(db, deps),
      reader: new UploadedSpreadsheetReader(),
      storage,
      agents: importAgents(db),
      ids,
      clock,
    }),
    runUnitImport: new RunDevelopmentUnitImport({
      uow: createPropertiesUnitOfWork(db, deps),
      reader: new XlsxSpreadsheetReader(),
      storage,
      codes: referenceCodes,
      ids,
      clock,
    }),
    runPropertyImport: new RunPropertyImport({
      uow: createPropertiesUnitOfWork(db, deps),
      reader: new UploadedSpreadsheetReader(),
      storage,
      directory: propertyImportDirectory(db, deps),
      producers: activeProducers(db),
      ids,
      clock,
    }),
    runTokkoUsersImport: new RunTokkoUsersImport({
      uow: createIdentityUnitOfWork(db, deps),
      source: tokkoApi,
      ids,
      clock,
    }),
    runTokkoApiPropertyImport: new RunTokkoApiPropertyImport({
      uow: createPropertiesUnitOfWork(db, deps),
      source: tokkoApi,
      storage,
      directory: propertyImportDirectory(db, deps),
      producers: activeProducers(db),
      ids,
      clock,
    }),
    opportunities: createOpportunityJobs(db, deps),
    matchFollowUps: new MatchFollowUps({
      uow: createClientsUnitOfWork(db, deps),
      listings: followUpListings(properties),
      candidates: new DrizzleFollowUpCandidatesQuery(db),
      ids,
      clock,
    }),
    revalidateSite: siteRevalidation(env, logger),
    routeInquiry: new RouteInquiry({
      uow: createClientsUnitOfWork(db, deps),
      agents: activeAgents(db),
      rulesEnabled: env.INQUIRY_RULES_ENABLED,
      ...deps,
    }),
    ...(portalJobs ? { portals: portalJobs } : {}),
    actor: SCHEDULER_ACTOR,
    importActor: IMPORT_ACTOR,
    conversionActor: CONVERSION_ACTOR,
    logger,
  })) {
    bus.subscribe(subscription);
  }
  if (portalJobs) {
    // Los contactos de los avisos de los portales, aunque el portal no avise (o el aviso se pierda).
    bus.schedule({
      name: 'portals.pull-leads',
      cron: '*/10 * * * *',
      run: async () => {
        await pullPortalLeads(portalJobs, logger);
      },
    });
    // Lo que el portal venció, cerró o pausó por moderación, antes de que empiece el día.
    bus.schedule({
      name: 'portals.reconcile-listings',
      cron: '0 6 * * *',
      run: async () => {
        await reconcilePortalListings(portalJobs, logger);
      },
    });
  }
  const relay = new OutboxRelay({ db, logger, publish: (event) => bus.publish(event) });

  return {
    async start() {
      await bus.start();
      relay.start();
    },
    async stop() {
      await relay.stop();
      await bus.stop();
      await database.close();
    },
  };
}

let jobs: JobsRuntime | undefined;

/**
 * Arranca el relay y los workers una sola vez por proceso. Devuelve `undefined` con
 * `JOBS_ENABLED=false`: los eventos esperan en el outbox hasta que otro proceso los tome.
 */
export async function startJobs(): Promise<JobsRuntime | undefined> {
  if (jobs) return jobs;
  const env = getEnv();
  const logger = getLogger().child({ component: 'jobs' });
  if (!env.JOBS_ENABLED) {
    logger.warn('Jobs disabled (JOBS_ENABLED=false): outbox events will wait');
    return undefined;
  }
  const runtime = createJobsRuntime(env, logger);
  jobs = runtime;
  await runtime.start();
  logger.info('Outbox relay and job workers started');
  return runtime;
}
