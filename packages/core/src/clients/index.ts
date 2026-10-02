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
  type ClientPhone,
  type ClientSnapshot,
} from './domain/client';
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
  type OpportunityId,
  type OpportunityNote,
  type OpportunitySnapshot,
} from './domain/opportunity';
export {
  MAX_DUPLICATE_CANDIDATES,
  type ClientRepository,
  type OpportunityRepository,
} from './domain/client.repository';
export type { ClientEvent } from './domain/client.events';
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
