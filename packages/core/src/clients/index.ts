// API pública del módulo clients (`@norde/core/clients`).

export * from './contracts';
export {
  CONTACT_CHANNELS,
  type ClientChannel,
  type ContactChannel,
} from './domain/contact-channel';
export {
  OPPORTUNITY_INTENTS,
  OPPORTUNITY_TYPES,
  type OpportunityIntent,
  type OpportunitySearch,
  type OpportunityType,
} from './domain/opportunity';
export { OPPORTUNITY_STATUSES, type OpportunityStatus } from './domain/opportunity-status';
export {
  Client,
  type ClientEmail,
  type ClientId,
  type ClientMergedError,
  type ClientPhone,
  type ClientSnapshot,
} from './domain/client';
export {
  CLIENT_RELATION_KINDS,
  MAX_CLIENT_RELATIONS,
  type ClientRelation,
  type ClientRelationKind,
} from './domain/client-relation';
export {
  ClientTag,
  ClientTagGroup,
  MAX_CLIENT_TAGS,
  type ClientTagGroupId,
  type ClientTagGroupSnapshot,
  type ClientTagId,
  type ClientTagSnapshot,
} from './domain/client-tag';
export {
  CLIENT_KINDS,
  CLIENT_TYPES,
  EMAIL_KINDS,
  PHONE_KINDS,
  PROFILE_FIELDS,
  type ClientKind,
  type ClientProfile,
  type ClientType,
  type EmailKind,
  type PhoneKind,
} from './domain/client-values';
export type { ContactKeys } from './domain/duplicate-check';
export {
  Opportunity,
  type OpportunityAgent,
  type OpportunityId,
  type OpportunityNote,
  type OpportunitySnapshot,
  type OpportunityStatusChange,
  type OpportunityStatusChangeId,
} from './domain/opportunity';
export {
  MAX_DUPLICATE_CANDIDATES,
  type ClientRepository,
  type ClientTagGroupRepository,
  type ClientTagRepository,
  type OpportunityCloseReasonRepository,
  type OpportunityRepository,
  type OpportunitySettingsRepository,
  type OpportunityStageRepository,
} from './domain/client.repository';
export type { ClientEvent, ClientsMerged } from './domain/client.events';
export type {
  OpportunityCreated,
  OpportunityEvent,
  OpportunityRequestAdded,
  OpportunityStatusChanged,
} from './domain/opportunity.events';
export type {
  ClientsTransaction,
  ClientsUnitOfWork,
} from './application/ports/clients-transaction';
export type { OpportunityNotification, TeamNotifier } from './application/ports/team-notifier';
export {
  RegisterContact,
  type RegisterContactError,
} from './application/commands/register-contact';
export {
  NotifyTeamOfOpportunity,
  type NotifyTeamOfOpportunityError,
} from './application/handlers/on-opportunity-activity';

// ---------- Interesados y envíos de una propiedad (#6) ----------

export {
  matchesSavedSearch,
  type MatchableProperty,
  type MatchableSearch,
} from './domain/saved-search-match';
export type {
  AgentNames,
  PropertyInterestCriteria,
  PropertyInterestQuery,
  PropertyProfiles,
  PropertySendsCriteria,
} from './application/ports/property-interest-query';
export {
  ListPropertyInterestedClients,
  type ListPropertyInterestedClientsError,
} from './application/queries/list-property-interested-clients';
export {
  ListPropertySends,
  type ListPropertySendsError,
} from './application/queries/list-property-sends';

// ---------- Agenda de contactos (#8) ----------

export type { ClientAgents } from './application/ports/client-agents';
export type {
  ClientExportFile,
  ClientExportWriter,
} from './application/ports/client-export-writer';
export type {
  ClientFilterCriteria,
  ClientListCriteria,
  ClientListItem,
  ClientListQuery,
} from './application/ports/client-list-query';
export type {
  AgentNotFoundError,
  ClientNotFoundError,
  DuplicateClientError,
} from './application/client-support';
export { CreateClient, type CreateClientError } from './application/commands/create-client';
export {
  UpdateClientDetails,
  type UpdateClientDetailsError,
} from './application/commands/update-client-details';
export { ReassignClient, type ReassignClientError } from './application/commands/reassign-client';
export { DeleteClient, type DeleteClientError } from './application/commands/delete-client';
export {
  EraseClientData,
  type EraseClientDataError,
} from './application/commands/erase-client-data';
export type { ClientErasure } from './application/ports/client-erasure';
export type {
  ClientErased,
  ErasureNotConfirmedError,
  ErasureRecord,
  ErasureRequestInFutureError,
} from './domain/client-erasure';
export { RestoreClient, type RestoreClientError } from './application/commands/restore-client';
export { ExportClients, type ExportClientsError } from './application/commands/export-clients';
export { ListClients, type ListClientsError } from './application/queries/list-clients';
export {
  GetClientDetail,
  type GetClientDetailError,
} from './application/queries/get-client-detail';
export {
  CheckClientDuplicates,
  type CheckClientDuplicatesError,
} from './application/queries/check-client-duplicates';
export {
  ListClientHistory,
  type ListClientHistoryError,
} from './application/queries/list-client-history';

// ---------- Etiquetas, agenda A–Z, relaciones y unificar (#8, etapa 2) ----------

export type {
  ClientLinkedRecords,
  ClientRecordCounts,
} from './application/ports/client-linked-records';
export type { ClientTagQuery } from './application/ports/client-tag-query';
export type {
  ClientRelationItem,
  ClientRelationQuery,
} from './application/ports/client-relation-query';
export {
  CreateClientTagGroup,
  type CreateClientTagGroupError,
} from './application/commands/create-client-tag-group';
export {
  RenameClientTagGroup,
  type RenameClientTagGroupError,
} from './application/commands/rename-client-tag-group';
export {
  DeleteClientTagGroup,
  type DeleteClientTagGroupError,
} from './application/commands/delete-client-tag-group';
export {
  CreateClientTag,
  type CreateClientTagError,
} from './application/commands/create-client-tag';
export {
  UpdateClientTag,
  type UpdateClientTagError,
} from './application/commands/update-client-tag';
export {
  DeleteClientTag,
  type DeleteClientTagError,
} from './application/commands/delete-client-tag';
export {
  MergeClientTags,
  type MergeClientTagsError,
} from './application/commands/merge-client-tags';
export {
  ChangeClientTags,
  type ChangeClientTagsError,
} from './application/commands/change-client-tags';
export { LinkClients, type LinkClientsError } from './application/commands/link-clients';
export { UnlinkClients, type UnlinkClientsError } from './application/commands/unlink-clients';
export { MergeClients, type MergeClientsError } from './application/commands/merge-clients';
export {
  ListClientTagGroups,
  type ListClientTagGroupsError,
} from './application/queries/list-client-tag-groups';
export {
  SearchClientTags,
  type SearchClientTagsError,
} from './application/queries/search-client-tags';
export {
  ListClientLetters,
  type ListClientLettersError,
} from './application/queries/list-client-letters';
export {
  ListClientRelations,
  type ListClientRelationsError,
} from './application/queries/list-client-relations';
export {
  PreviewClientMerge,
  type PreviewClientMergeError,
} from './application/queries/preview-client-merge';

// ---------- Ficha completa: actividad, notas, oportunidades, destacadas (#8, etapa 3) ----------

export {
  CLIENT_ACTIVITY_KINDS,
  MAX_NOTE_LENGTH,
  type ClientActivity,
  type ClientActivityBody,
  type ClientActivityKind,
} from './domain/client-activity';
export {
  FeaturedListing,
  type FeaturedListingId,
  type FeaturedListingSnapshot,
} from './domain/featured-listing';
export type {
  ClientActivityRepository,
  FeaturedListingRepository,
} from './domain/client.repository';
export type {
  ClientActivityItem,
  ClientFeaturedItem,
  ClientListings,
  ClientOpportunityItem,
  ClientRecordQuery,
} from './application/ports/client-record-query';
export { AddClientNote, type AddClientNoteError } from './application/commands/add-client-note';
export {
  FeatureProperties,
  type FeaturePropertiesError,
  type ListingNotFoundError,
} from './application/commands/feature-properties';
export {
  UnfeatureProperty,
  type UnfeaturePropertyError,
} from './application/commands/unfeature-property';
export {
  RecordClientActivity,
  type ClientActivityEvent,
  type RecordClientActivityError,
} from './application/handlers/on-client-activity-event';
export {
  ListClientActivity,
  type ListClientActivityError,
} from './application/queries/list-client-activity';
export {
  ListClientOpportunities,
  type ListClientOpportunitiesError,
} from './application/queries/list-client-opportunities';
export {
  ListClientFeatured,
  type ListClientFeaturedError,
} from './application/queries/list-client-featured';
export {
  ListClientSavedSearches,
  type ListClientSavedSearchesError,
} from './application/queries/list-client-saved-searches';
export {
  GetFeaturedPropertyIds,
  type GetFeaturedPropertyIdsError,
} from './application/queries/get-featured-property-ids';

// ---------- Importación desde Excel (#8, etapa 4) ----------
export {
  StartClientImport,
  type StartClientImportError,
} from './application/commands/start-client-import';
export {
  RunClientImport,
  type ClientImportNotFoundError,
  type RunClientImportError,
} from './application/handlers/run-client-import';
export {
  PreviewClientImport,
  type PreviewClientImportError,
  type TooManyImportColumnsError,
} from './application/queries/preview-client-import';
export {
  ListClientImports,
  type ListClientImportsError,
} from './application/queries/list-client-imports';
export {
  GetClientImport,
  type GetClientImportError,
} from './application/queries/get-client-import';
export {
  ListClientImportProblems,
  type ListClientImportProblemsError,
} from './application/queries/list-client-import-problems';
export type { ClientImportItem, ClientImportQuery } from './application/ports/client-import-query';
export type {
  Spreadsheet,
  SpreadsheetReader,
  SpreadsheetRow,
  UnreadableSpreadsheetError,
} from './application/ports/spreadsheet-reader';
export type { ClientImportRepository } from './domain/client.repository';
export {
  ClientImport,
  CLIENT_IMPORT_FAILURES,
  CLIENT_IMPORT_STATUSES,
  IMPORT_FIELDS,
  IMPORT_PROBLEM_CODES,
  type ClientImportFailure,
  type ClientImportId,
  type ClientImportRequested,
  type ClientImportSnapshot,
  type ClientImportStatus,
  type ClientImportTotals,
  type EmptyImportFileError,
  type ImportField,
  type ImportFinishedError,
  type ImportMapping,
  type ImportProblemCode,
  type ImportRowProblem,
  type InvalidImportMappingError,
  type TooManyImportRowsError,
} from './domain/client-import';

// ---------- Oportunidades (#9) ----------

export {
  MAX_OPPORTUNITY_STAGES,
  OpportunityStage,
  type OpportunityStageId,
  type OpportunityStageSnapshot,
} from './domain/opportunity-stage';
export {
  CLOSE_REASON_RATINGS,
  MAX_CLOSE_REASONS,
  OpportunityCloseReason,
  type CloseReasonRating,
  type OpportunityCloseReasonId,
  type OpportunityCloseReasonSnapshot,
} from './domain/opportunity-close-reason';
export {
  NO_RULES,
  OPPORTUNITY_RULES,
  type OpportunityRule,
  type OpportunityRules,
} from './domain/opportunity-settings';
export { stageTenure, type StageTenure } from './domain/opportunity-tenure';
export {
  CreateOpportunityStage,
  type CreateOpportunityStageError,
} from './application/commands/create-opportunity-stage';
export {
  UpdateOpportunityStage,
  type UpdateOpportunityStageError,
} from './application/commands/update-opportunity-stage';
export {
  ReorderOpportunityStages,
  type ReorderOpportunityStagesError,
} from './application/commands/reorder-opportunity-stages';
export {
  DeactivateOpportunityStage,
  type DeactivateOpportunityStageError,
} from './application/commands/deactivate-opportunity-stage';
export {
  ReactivateOpportunityStage,
  type ReactivateOpportunityStageError,
} from './application/commands/reactivate-opportunity-stage';
export {
  CreateCloseReason,
  type CreateCloseReasonError,
} from './application/commands/create-close-reason';
export {
  UpdateCloseReason,
  type UpdateCloseReasonError,
} from './application/commands/update-close-reason';
export {
  ReorderCloseReasons,
  type ReorderCloseReasonsError,
} from './application/commands/reorder-close-reasons';
export {
  DeactivateCloseReason,
  type DeactivateCloseReasonError,
} from './application/commands/deactivate-close-reason';
export {
  ReactivateCloseReason,
  type ReactivateCloseReasonError,
} from './application/commands/reactivate-close-reason';
export {
  UpdateOpportunitySettings,
  type UpdateOpportunitySettingsError,
} from './application/commands/update-opportunity-settings';
export { GetOpportunityConfiguration } from './application/queries/get-opportunity-configuration';
