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
export { DrizzleUserFavorites } from './identity/drizzle-user-favorites';
export { DrizzlePropertyCatalogQuery } from './properties/drizzle-property-catalog-query';
export { NominatimGeocoder } from './adapters/geocoding/nominatim-geocoder';
export { FilePropertyExportWriter } from './adapters/exports/property-export-writer';
export { createClientsUnitOfWork } from './clients/clients-unit-of-work';
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

export { OutboxRelay, type OutboxRelayOptions } from './jobs/outbox-relay';
export {
  PgBossEventBus,
  type EventSubscription,
  type PgBossEventBusOptions,
} from './jobs/pg-boss-event-bus';
export type { PublishedEvent } from './jobs/published-event';
