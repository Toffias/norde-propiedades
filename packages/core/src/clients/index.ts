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
export { Client, type ClientId, type ClientSnapshot } from './domain/client';
export {
  Opportunity,
  type OpportunityId,
  type OpportunityNote,
  type OpportunitySnapshot,
} from './domain/opportunity';
export type { ClientRepository, OpportunityRepository } from './domain/client.repository';
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
