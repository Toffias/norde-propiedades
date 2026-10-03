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
  type OpportunityNotReferredError,
  type OpportunityReferral,
  type OpportunitySnapshot,
  type OpportunityStatusChange,
  type OpportunityStatusChangeId,
  REFERRAL_RESULTS,
  type ReferralResult,
} from './domain/opportunity';
export {
  BULK_SYNC_LIMIT,
  MAX_BULK_OPPORTUNITIES,
  OpportunityBulkOperation,
  type OpportunityBulkAction,
  type OpportunityBulkOperationId,
  type OpportunityBulkOperationSnapshot,
  type OpportunityBulkSelection,
  type OpportunityBulkStatus,
} from './domain/opportunity-bulk-operation';
export {
  MAX_DUPLICATE_CANDIDATES,
  type ClientRepository,
  type ClientTagGroupRepository,
  type ClientTagRepository,
  type OpportunityCloseReasonRepository,
  type OpportunityBulkOperationRepository,
  type OpportunityRepository,
  type OpportunitySettingsRepository,
  type OpportunityStageRepository,
} from './domain/client.repository';
export type { ClientEvent, ClientsMerged } from './domain/client.events';
export type {
  OpportunityCreated,
  OpportunityEvent,
  OpportunityListingsFeatured,
  OpportunityReassigned,
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
  bestMatchScore,
  matchesSavedSearch,
  matchScore,
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
  SavedSearchRepository,
} from './domain/client.repository';
export {
  MAX_SAVED_SEARCHES_PER_CLIENT,
  SavedSearch,
  type InvalidSavedSearchError,
  type SavedSearchFields,
  type SavedSearchId,
  type SavedSearchLimitReachedError,
  type SavedSearchSnapshot,
  type SavedSearchUnsubscribedError,
} from './domain/saved-search';
export type { SavedSearchLocations } from './application/ports/saved-search-locations';
export type { SavedSearchNotFoundError } from './application/saved-search-support';
export {
  CreateSavedSearch,
  type CreateSavedSearchError,
} from './application/commands/create-saved-search';
export {
  UpdateSavedSearch,
  type UpdateSavedSearchError,
} from './application/commands/update-saved-search';
export {
  DeleteSavedSearch,
  type DeleteSavedSearchError,
} from './application/commands/delete-saved-search';
export {
  RestoreSavedSearch,
  type RestoreSavedSearchError,
} from './application/commands/restore-saved-search';
export { GetSavedSearch, type GetSavedSearchError } from './application/queries/get-saved-search';
export {
  SetFeaturedAutoSend,
  type FeaturedListingNotFoundError,
  type SetFeaturedAutoSendError,
} from './application/commands/set-featured-auto-send';
export type {
  ClientActivityItem,
  ClientFeaturedItem,
  ClientListings,
  ClientActiveOpportunityItem,
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
export type {
  OpportunityFilterCriteria,
  OpportunityBulkCriteria,
  OpportunityListCriteria,
  OpportunityPipelineItem,
  OpportunityPipelineQuery,
} from './application/ports/opportunity-pipeline-query';
export {
  ListOpportunities,
  type ListOpportunitiesError,
} from './application/queries/list-opportunities';
export {
  ListOpportunityHistory,
  type ListOpportunityHistoryError,
} from './application/queries/list-opportunity-history';
export {
  BulkUpdateOpportunities,
  type BulkUpdateOpportunitiesError,
} from './application/commands/bulk-update-opportunities';
export {
  UpdateOpportunityReferral,
  type UpdateOpportunityReferralError,
} from './application/commands/update-opportunity-referral';
export {
  GetOpportunityBulkOperation,
  type GetOpportunityBulkOperationError,
} from './application/queries/get-opportunity-bulk-operation';
export {
  RunOpportunityBulkOperation,
  type RunOpportunityBulkOperationError,
} from './application/handlers/run-opportunity-bulk-operation';
export {
  ApplyOpportunityRules,
  type OpportunityRuleEvent,
  type OpportunityRuleOutcome,
} from './application/handlers/apply-opportunity-rules';
export type { OpportunityRequesters } from './application/ports/opportunity-requesters';
export {
  CountOpportunitiesByStage,
  type CountOpportunitiesByStageError,
} from './application/queries/count-opportunities-by-stage';
export { CountPendingOpportunities } from './application/queries/count-pending-opportunities';

// Consultas (#10)
export {
  Inquiry,
  INQUIRY_STATUSES,
  suggestedOpportunityType,
  type InquiryAlreadyAssignedError,
  type InquiryAlreadyDeletedError,
  type InquiryId,
  type InquiryInTrashError,
  type InquiryNotDeletedError,
  type InquirySender,
  type InquirySnapshot,
  type InquiryStatus,
} from './domain/inquiry';
export type { InquiryEvent } from './domain/inquiry.events';
export {
  INQUIRY_TAG_KINDS,
  inquiryAutoTags,
  type InquiryPropertyFacts,
  type InquiryTagKind,
} from './domain/inquiry-tags';
export type { InquiryRepository } from './domain/client.repository';
export type { BranchNames } from './application/ports/branch-names';
export type {
  InquiryInboxCriteria,
  InquiryInboxItem,
  InquiryInboxQuery,
} from './application/ports/inquiry-inbox-query';
export type { InquiryPropertyLookup } from './application/ports/inquiry-property-lookup';
export type {
  InquiryMatchCriteria,
  InquiryMatchItem,
  InquiryMatchQuery,
} from './application/ports/inquiry-match-query';
export type { InquiryNotFoundError } from './application/inquiry-support';
export { ReceiveInquiry, type ReceiveInquiryError } from './application/commands/receive-inquiry';
export { DeleteInquiry, type DeleteInquiryError } from './application/commands/delete-inquiry';
export { RestoreInquiry, type RestoreInquiryError } from './application/commands/restore-inquiry';
export { ListInquiries, type ListInquiriesError } from './application/queries/list-inquiries';
export { CountPendingInquiries } from './application/queries/count-pending-inquiries';
export {
  AssignInquiry,
  type AssignInquiryError,
  type InquiryClientMismatchError,
} from './application/commands/assign-inquiry';
export {
  ListInquiryMatches,
  type ListInquiryMatchesError,
} from './application/queries/list-inquiry-matches';
export {
  ANY_INQUIRY,
  byPriority,
  findRuleFor,
  InquiryAssignmentRule,
  inquiryRoutingFacts,
  MAX_CONDITION_VALUES,
  MAX_INQUIRY_RULES,
  MAX_RULE_AGENTS,
  type InquiryRoutingFacts,
  type InquiryRuleConditions,
  type InquiryRuleId,
  type InquiryRuleSnapshot,
  type InvalidInquiryRuleError,
  type TooManyInquiryRulesError,
} from './domain/inquiry-assignment-rule';
export {
  MAX_AGENT_WEIGHT,
  MIN_AGENT_WEIGHT,
  pickWeighted,
  type WeightedAgent,
} from './domain/weighted-distribution';
export type { InquiryRuleRepository } from './domain/client.repository';
export type {
  InquiryRuleCriteria,
  InquiryRuleItem,
  InquiryRuleQuery,
} from './application/ports/inquiry-rule-query';
export type { InquiryRuleNotFoundError } from './application/inquiry-rule-support';
export {
  CreateInquiryRule,
  type CreateInquiryRuleError,
} from './application/commands/create-inquiry-rule';
export {
  UpdateInquiryRule,
  type UpdateInquiryRuleError,
} from './application/commands/update-inquiry-rule';
export {
  SetInquiryRuleActive,
  type SetInquiryRuleActiveError,
} from './application/commands/set-inquiry-rule-active';
export {
  MoveInquiryRule,
  type MoveInquiryRuleError,
} from './application/commands/move-inquiry-rule';
export {
  DeleteInquiryRule,
  type DeleteInquiryRuleError,
} from './application/commands/delete-inquiry-rule';
export {
  ListInquiryRules,
  type ListInquiryRulesError,
} from './application/queries/list-inquiry-rules';
export { GetInquiryRule, type GetInquiryRuleError } from './application/queries/get-inquiry-rule';
export { RouteInquiry, type InquiryRouteOutcome } from './application/handlers/route-inquiry';
export {
  ChangeOpportunityStage,
  type ChangeOpportunityStageError,
} from './application/commands/change-opportunity-stage';
export {
  CloseOpportunity,
  type CloseOpportunityError,
} from './application/commands/close-opportunity';
export {
  ReassignOpportunity,
  type ReassignOpportunityError,
} from './application/commands/reassign-opportunity';
