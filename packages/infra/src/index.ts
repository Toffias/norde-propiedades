// API pública de @norde/infra. Solo se importa desde el composition root de cada app.

export {
  createDatabase,
  type Database,
  type DatabaseConnection,
  type DatabaseOptions,
} from './db/client';
export type { DbExecutor } from './db/executor';
export { DrizzleUnitOfWork } from './db/unit-of-work';

export { SystemClock } from './shared/system-clock';
export { UuidV7IdGenerator } from './shared/uuid-v7-id-generator';
export { DrizzleAuditLog } from './shared/drizzle-audit-log';
export { DrizzleOutboxPublisher } from './shared/drizzle-outbox-publisher';
export { maskEmail, maskPhone, type InfraLogger } from './shared/logger';

export { createAppraisalsUnitOfWork } from './appraisals/appraisals-unit-of-work';
export { DrizzleAppraisalQuery } from './appraisals/drizzle-appraisal-query';
export {
  DrizzleAppraisalCodeSequence,
  DrizzleAppraisalRepository,
} from './appraisals/drizzle-appraisal-repository';

export {
  BetterAuthSessionReader,
  createAuth,
  type Auth,
  type AuthOptions,
} from './identity/better-auth';
export { DrizzleUserAccessQuery } from './identity/drizzle-user-access-query';
export { BetterAuthPasswordHasher } from './identity/better-auth-password-hasher';
export { createIdentityUnitOfWork } from './identity/identity-unit-of-work';
export { DrizzleUserListQuery } from './identity/drizzle-user-list-query';
export { DrizzleRoleListQuery } from './identity/drizzle-role-list-query';
export { DrizzleOrganizationQuery } from './identity/drizzle-organization-query';

export { DrizzlePropertySearchQuery } from './properties/drizzle-property-search-query';
export { DrizzlePanelPropertyListQuery } from './properties/drizzle-panel-property-list-query';
export { createPropertiesUnitOfWork } from './properties/properties-unit-of-work';
export { DrizzleDevelopmentListQuery } from './properties/drizzle-development-list-query';
export { DrizzleDevelopmentUnitImportQuery } from './properties/drizzle-development-unit-imports';
export {
  DrizzleClientFavoriteErasure,
  DrizzleUserFavorites,
} from './identity/drizzle-user-favorites';
export { DrizzlePropertyClientErasure } from './properties/drizzle-property-client-erasure';
export {
  DrizzlePropertyReservationsQuery,
  DrizzleReservationListQuery,
} from './properties/drizzle-property-reservations-query';
export { DrizzlePropertyCatalogQuery } from './properties/drizzle-property-catalog-query';
export { DrizzleMediaQuery } from './properties/drizzle-media-query';
export { DrizzlePropertyDocumentQuery } from './properties/drizzle-property-documents';
export { DrizzlePropertyDetailLookups } from './properties/drizzle-property-detail-lookups';
export { DrizzleAuditHistoryQuery } from './audit/drizzle-audit-history-query';
export { DrizzlePropertyInterestQuery } from './clients/drizzle-property-interest-query';
export { DrizzlePropertyStatisticsQuery } from './reporting/drizzle-property-statistics-query';
export { PdfLibPropertyDocumentRenderer } from './adapters/exports/property-document-renderer';
export { NominatimGeocoder } from './adapters/geocoding/nominatim-geocoder';
export { FilePropertyExportWriter } from './adapters/exports/property-export-writer';
export { XlsxClientExportWriter } from './adapters/exports/client-export-writer';
export { XlsxDevelopmentUnitsExportWriter } from './adapters/exports/development-units-export-writer';
export { XlsxReservationExportWriter } from './adapters/exports/reservation-export-writer';
export { XlsxSpreadsheetReader } from './adapters/imports/xlsx-spreadsheet-reader';
export { DrizzleClientListQuery } from './clients/drizzle-client-list-query';
export { DrizzleOpportunityPipelineQuery } from './clients/drizzle-opportunity-pipeline-query';
export { DrizzleInquiryInboxQuery } from './clients/drizzle-inquiry-inbox-query';
export { DrizzleInquiryMatchQuery } from './clients/drizzle-inquiry-match-query';
export { DrizzleInquiryRepository } from './clients/drizzle-inquiry-repository';
export { DrizzleInquiryRuleQuery } from './clients/drizzle-inquiry-rule-query';
export { DrizzleInquiryRuleRepository } from './clients/drizzle-inquiry-rule-repository';
export { DrizzleClientTagQuery } from './clients/drizzle-client-tag-query';
export { DrizzleClientRelationQuery } from './clients/drizzle-client-relation-query';
export { DrizzleClientRecordQuery } from './clients/drizzle-client-record-query';
export {
  DrizzleClientActivityRepository,
  DrizzleFeaturedListingRepository,
} from './clients/drizzle-client-activity-repositories';
export { createClientsUnitOfWork } from './clients/clients-unit-of-work';
export { DrizzleClientImportQuery } from './clients/drizzle-client-imports';
export {
  DrizzleClientRepository,
  DrizzleOpportunityRepository,
} from './clients/drizzle-client-repositories';
export { createSettingsUnitOfWork } from './settings/settings-unit-of-work';
export {
  DrizzleCompanyFileRepository,
  DrizzleCompanySettingsRepository,
  DrizzleFileFolderRepository,
  DrizzleReferenceCodeSequenceRepository,
} from './settings/drizzle-settings-repositories';
export {
  DrizzleCompanyFilesQuery,
  DrizzleDirectory,
  DrizzleReferenceCodeSequenceQuery,
  DrizzleReferenceCodeUsage,
} from './settings/drizzle-settings-queries';
export { createConversationsUnitOfWork } from './conversations/conversations-unit-of-work';
export { DrizzleClientConversationErasure } from './conversations/drizzle-client-conversation-erasure';
export {
  DrizzleConversationRepository,
  DrizzleMessageLog,
} from './conversations/drizzle-conversation-repositories';

export {
  MetaWhatsAppMessenger,
  WHATSAPP_BUTTON_BODY_LIMIT,
  WHATSAPP_BUTTON_TITLE_LIMIT,
  WHATSAPP_CAPTION_LIMIT,
  WHATSAPP_MAX_BUTTONS,
  WHATSAPP_TEXT_LIMIT,
  type MetaWhatsAppMessengerOptions,
} from './adapters/whatsapp/meta-whatsapp-messenger';
export { LogTeamNotifier, WebhookTeamNotifier } from './adapters/notifications/team-notifiers';
export { S3FileStorage, type S3FileStorageOptions } from './adapters/storage/s3-file-storage';
export { LocalFileStorage } from './adapters/storage/local-file-storage';
export { ResendMailer, type ResendMailerOptions } from './adapters/mail/resend-mailer';
export { SharpImageWatermarker } from './adapters/images/sharp-image-watermarker';
export { SharpImageVariantGenerator } from './adapters/images/sharp-image-variant-generator';

export { OutboxRelay, type OutboxRelayOptions } from './jobs/outbox-relay';
export {
  PgBossEventBus,
  type EventSubscription,
  type PgBossEventBusOptions,
} from './jobs/pg-boss-event-bus';
export type { PublishedEvent } from './jobs/published-event';
