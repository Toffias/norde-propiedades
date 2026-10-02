import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core que usan los Server Components y las Server Actions.

import {
  AddFavorites,
  AddTeamMember,
  ChangeOwnPassword,
  CreateBranch,
  CreateRole,
  CreateTeam,
  CreateUser,
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
  FeatureProperties,
  GetFeaturedPropertyIds,
  ListClientActivity,
  ListClientFeatured,
  ListClientOpportunities,
  ListClientSavedSearches,
  UnfeatureProperty,
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
  type ClientAgents,
  type ClientListings,
  type PropertyProfiles,
} from '@norde/core/clients';
import {
  AddPropertyMediaLink,
  BulkEditProperties,
  ChangePropertyCode,
  ChangePropertyProducer,
  ChangePropertyStatus,
  ChangePropertyTags,
  CompareProperties,
  GetPropertySummaries,
  ListOwnedProperties,
  CreateCustomAttribute,
  DeletePropertyAttachment,
  DeletePropertyMedia,
  GetPanelPropertyDetail,
  GetPropertyAttachmentDownload,
  GetPropertyDocumentDownload,
  GetPropertyInterestProfile,
  GetPropertyMediaFile,
  ListCustomAttributes,
  ListPropertyAttachments,
  ListPropertyDocuments,
  ListPropertyHistory,
  ListPropertyMedia,
  ReorderPropertyMedia,
  RequestPropertyDocument,
  SendOwnerReport,
  SetPropertyCover,
  UpdateCustomAttribute,
  UpdatePropertyAttachment,
  UpdatePropertyCharacteristics,
  UpdatePropertyCustomAttributes,
  UpdatePropertyDeal,
  UpdatePropertyDescription,
  UpdatePropertyFeatures,
  UpdatePropertyInternalInfo,
  UpdatePropertyLocation,
  UpdatePropertyMedia,
  UpdatePropertyOperations,
  UpdatePropertyPublication,
  UploadPropertyAttachment,
  UploadPropertyMedia,
  CreateFeature,
  CreateLocation,
  CreateProperty,
  CreateTag,
  CreateTagGroup,
  DeleteFavoriteSearch,
  DeleteProperty,
  DeleteTag,
  DeleteTagGroup,
  ExportProperties,
  GetPropertyConfiguration,
  GetPropertyMap,
  ListFavoriteSearches,
  ListFeatures,
  ListPanelProperties,
  ListTagGroups,
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
  GetOwnerReport,
  GetPropertyStatistics,
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
import { err, ok, type Clock, type IdGenerator } from '@norde/core/shared';
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
  DrizzleClientRelationQuery,
  DrizzleClientRecordQuery,
  DrizzleClientTagQuery,
  DrizzleCompanyFileRepository,
  DrizzleCompanyFilesQuery,
  DrizzleCompanySettingsRepository,
  DrizzleDirectory,
  DrizzleOrganizationQuery,
  DrizzlePanelPropertyListQuery,
  DrizzlePropertyCatalogQuery,
  DrizzlePropertyDetailLookups,
  DrizzlePropertyDocumentQuery,
  DrizzlePropertyInterestQuery,
  DrizzlePropertyMediaQuery,
  DrizzlePropertyStatisticsQuery,
  DrizzleReferenceCodeSequenceQuery,
  DrizzleRoleListQuery,
  DrizzleUserAccessQuery,
  DrizzleUserFavorites,
  DrizzleUserListQuery,
  FilePropertyExportWriter,
  LocalFileStorage,
  NominatimGeocoder,
  ResendMailer,
  S3FileStorage,
  SharpImageWatermarker,
  SystemClock,
  UuidV7IdGenerator,
  XlsxClientExportWriter,
  XlsxSpreadsheetReader,
  DrizzleClientImportQuery,
  type Database,
  type DatabaseConnection,
} from '@norde/infra';
import { nextCookies } from 'better-auth/next-js';

import { getEnv, type Env } from './config/env';
import { getLogger } from './config/logger';

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
    readonly updateUser: UpdateUser;
    readonly suspendUser: SuspendUser;
    readonly reactivateUser: ReactivateUser;
    readonly resetUserPassword: ResetUserPassword;
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
}

export type SettingsUseCases = ReturnType<typeof createSettingsUseCases>;
export type PropertiesUseCases = ReturnType<typeof createPropertiesUseCases>;
export type ClientsUseCases = ReturnType<typeof createDetailReadModels>['clients'] &
  ReturnType<typeof createClientsUseCases>;
export type ReportingUseCases = ReturnType<typeof createDetailReadModels>['reporting'];

let container: Container | undefined;

function createStorage(env: Env): FileStorage {
  if (env.STORAGE_DRIVER !== 's3') return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  // `getEnv` ya exigió estas variables con STORAGE_DRIVER=s3.
  return new S3FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? '',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  });
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
  const media = new DrizzlePropertyMediaQuery(db);
  const geocoder = new NominatimGeocoder({
    userAgent: env.GEOCODER_USER_AGENT,
    baseUrl: env.GEOCODER_URL,
    logger: getLogger(),
  });

  return {
    listPanelProperties: new ListPanelProperties({ properties: list, users }),
    getPropertyMap: new GetPropertyMap({ properties: list }),
    compareProperties: new CompareProperties({ properties: list, users }),
    listOwnedProperties: new ListOwnedProperties({ properties: list, users }),
    getPropertySummaries: new GetPropertySummaries({ properties: list, users }),
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
    // Multimedia y archivos
    listPropertyMedia: new ListPropertyMedia({ media }),
    getPropertyMediaFile: new GetPropertyMediaFile({ uow, storage }),
    uploadPropertyMedia: new UploadPropertyMedia({ uow, storage, ids, clock }),
    addPropertyMediaLink: new AddPropertyMediaLink({ uow, ids, clock }),
    updatePropertyMedia: new UpdatePropertyMedia({ uow, clock }),
    reorderPropertyMedia: new ReorderPropertyMedia({ uow, clock }),
    setPropertyCover: new SetPropertyCover({ uow, clock }),
    deletePropertyMedia: new DeletePropertyMedia({ uow, clock }),
    listPropertyAttachments: new ListPropertyAttachments({ media, users }),
    uploadPropertyAttachment: new UploadPropertyAttachment({ uow, storage, ids, clock }),
    updatePropertyAttachment: new UpdatePropertyAttachment({ uow, clock }),
    deletePropertyAttachment: new DeletePropertyAttachment({ uow, clock }),
    getPropertyAttachmentDownload: new GetPropertyAttachmentDownload({ uow, storage }),
    // PDF
    requestPropertyDocument: new RequestPropertyDocument({ uow, ids, clock }),
    listPropertyDocuments: new ListPropertyDocuments({
      documents: new DrizzlePropertyDocumentQuery(db),
      users,
    }),
    getPropertyDocumentDownload: new GetPropertyDocumentDownload({ uow, storage }),
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
function createClientsUseCases(
  db: Database,
  properties: PropertiesUseCases,
  deps: { readonly ids: IdGenerator; readonly clock: Clock; readonly storage: FileStorage },
) {
  const { ids, clock, storage } = deps;
  const uow = createClientsUnitOfWork(db, { ids, clock });
  const reader = new XlsxSpreadsheetReader();
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
  // Las propiedades que se muestran en la ficha del contacto, por la API pública de properties.
  const listings: ClientListings = {
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
            coverImageUrl: row.coverImageUrl,
          },
        ]),
      );
    },
  };
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
    featureProperties: new FeatureProperties({ uow, listings, ids, clock }),
    unfeatureProperty: new UnfeatureProperty({ uow, clock }),
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
  const profiles: PropertyProfiles & ReportingPropertyProfiles = {
    async find(propertyId, actor) {
      const profile = await properties.getPropertyInterestProfile.execute({ propertyId }, actor);
      return profile.isOk() ? profile.value : undefined;
    },
  };
  const interest = new DrizzlePropertyInterestQuery(db);
  const statistics = new DrizzlePropertyStatisticsQuery(db);
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

  return {
    database,
    ids,
    handleAuthRequest: (request) => auth.handler(request),
    sessions: new BetterAuthSessionReader(auth),
    resolveSessionActor: new ResolveSessionActor({ users: userAccess }),
    settings,
    properties,
    ...withClients(
      createDetailReadModels(database.db, properties, { clock }),
      createClientsUseCases(database.db, properties, { ids, clock, storage: createStorage(env) }),
    ),
    identity: {
      listUsers: new ListUsers({ users: new DrizzleUserListQuery(database.db) }),
      listRoles: new ListRoles({ roles: roleQuery }),
      createUser: new CreateUser({ uow: identityUow, hasher, ids, clock }),
      updateUser: new UpdateUser({ uow: identityUow, clock }),
      suspendUser: new SuspendUser({ uow: identityUow, clock }),
      reactivateUser: new ReactivateUser({ uow: identityUow, clock }),
      resetUserPassword: new ResetUserPassword({ uow: identityUow, hasher, clock }),
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
