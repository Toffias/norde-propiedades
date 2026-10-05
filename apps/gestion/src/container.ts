import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core que usan los Server Components y las Server Actions.

import {
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
  UpdateInquiryRule,
  type ClientAgents,
  type ClientListings,
  type PropertyProfiles,
} from '@norde/core/clients';
import {
  AddMediaLink,
  BulkEditProperties,
  ChangePropertyCode,
  ChangePropertyProducer,
  ChangePropertyStatus,
  ChangePropertyTags,
  CompareProperties,
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
  GetMediaFile,
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
  GetPendingOpportunities,
  GetPortfolioSummary,
  GetPropertyStatistics,
  GetUnassignedInquiries,
  GetUpcomingSignings,
  GlobalSearch,
  ListAvailableDevelopments,
  ListAvailableProperties,
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
  DrizzleOpportunityPipelineQuery,
  DrizzleInquiryInboxQuery,
  DrizzleInquiryMatchQuery,
  DrizzleInquiryRuleQuery,
  DrizzleClientRelationQuery,
  DrizzleClientRecordQuery,
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
  DrizzleMediaQuery,
  DrizzlePropertyStatisticsQuery,
  DrizzleHomeDashboardQuery,
  DrizzleReferenceCodeSequenceQuery,
  DrizzleRoleListQuery,
  DrizzleUserAccessQuery,
  DrizzleUserFavorites,
  DrizzleUserListQuery,
  FilePropertyExportWriter,
  DrizzleDevelopmentUnitImportQuery,
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
  XlsxSpreadsheetReader,
  DrizzleClientImportQuery,
  type Database,
  type DatabaseConnection,
  createAppraisalsUnitOfWork,
  DrizzleAppraisalQuery,
  PdfLibAppraisalReportRenderer,
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
  /** Bandeja de consultas de portales y de la web (#10). */
  readonly inquiries: InquiriesUseCases;
  /** Buscador de la barra superior: contactos, propiedades, emprendimientos y agentes. */
  readonly search: { readonly globalSearch: GlobalSearch };
  /** Tasaciones: listado, alta, edición, estados y papelera (#12). */
  readonly appraisals: AppraisalsUseCases;
  /** Noticias: el feed de actividad de la empresa (#16). */
  readonly news: { readonly listNews: ListNews };
}

export type SettingsUseCases = ReturnType<typeof createSettingsUseCases>;
export type PropertiesUseCases = ReturnType<typeof createPropertiesUseCases>;
export type ClientsUseCases = ReturnType<typeof createDetailReadModels>['clients'] &
  ReturnType<typeof createClientsUseCases>;
export type ReportingUseCases = ReturnType<typeof createDetailReadModels>['reporting'];
export type InquiriesUseCases = ReturnType<typeof createInquiriesUseCases>;
export type AppraisalsUseCases = ReturnType<typeof createAppraisalsUseCases>;

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
    getPropertyInterestProfiles: new GetPropertyInterestProfiles({ uow }),
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
      getUnassignedInquiries: new GetUnassignedInquiries({ home }),
      getPendingOpportunities: new GetPendingOpportunities({ home, users: agents }),
      getUpcomingSignings: new GetUpcomingSignings({ home, users: agents, clock: deps.clock }),
      getPortfolioSummary: new GetPortfolioSummary({ home }),
      listAvailableProperties: new ListAvailableProperties({ home, users: agents }),
      listAvailableDevelopments: new ListAvailableDevelopments({ home, users: agents }),
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
    createClientsUseCases(database.db, properties, { ids, clock, storage: createStorage(env) }),
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
    news: { listNews: createListNews(database.db, clock) },
    identity: {
      listUsers,
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
