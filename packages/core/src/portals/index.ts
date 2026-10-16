// API pública del módulo portals (`@norde/core/portals`).

export * from './contracts';

export {
  LISTING_OWNER_KINDS,
  PORTAL_CATALOG,
  LISTING_SCOPES,
  PORTAL_CONNECTION_METHODS,
  PORTALS,
  isPortalId,
  portalPublishes,
  type ListingOwnerKind,
  type ListingScope,
  type PortalConnectionMethod,
  type PortalDefinition,
  type PortalId,
  type PortalProvider,
} from './domain/portal';
export {
  PortalAccount,
  type PortalAccountInUseError,
  type PortalAccountSnapshot,
  type PortalConnection,
  type PortalNotConnectedError,
} from './domain/portal-account';
export type { PortalAccountRepository } from './domain/portals.repository';

export type { ValidationFailedError } from './application/portals-input';
export type { WrongConnectionMethodError } from './application/connection-method';
export type {
  PortalAuthorizationError,
  PortalAuthorizationGrant,
  PortalAuthorizationRejectedError,
  PortalAuthorizationRequest,
  PortalAuthorizer,
  PortalCredentials,
  PortalNotConfiguredError,
  PortalUnavailableError,
} from './application/ports/portal-authorizer';
export type {
  PortalAccountBlockedError,
  PortalAccountDirectory,
  PortalAccountLookupError,
  PortalAccountMatch,
  PortalAccountNotFoundError,
  PortalCredit,
} from './application/ports/portal-account-directory';
export type {
  PortalCredentialStore,
  PortalsTransaction,
  PortalsUnitOfWork,
} from './application/ports/portals-transaction';

export {
  StartPortalConnection,
  type StartPortalConnectionError,
} from './application/commands/start-portal-connection';
export {
  ConnectPortalAccount,
  type ConnectPortalAccountError,
  type InvalidAuthorizationStateError,
} from './application/commands/connect-portal-account';
export {
  ConnectPortalAccountWithCode,
  type ConnectPortalAccountWithCodeError,
} from './application/commands/connect-portal-account-with-code';
export {
  DisconnectPortalAccount,
  type DisconnectPortalAccountError,
} from './application/commands/disconnect-portal-account';
export {
  SetPortalAccountEnabled,
  type SetPortalAccountEnabledError,
} from './application/commands/set-portal-account-enabled';
export {
  ListPortalAccounts,
  type ListPortalAccountsError,
} from './application/queries/list-portal-accounts';
export {
  GetPortalCredits,
  type GetPortalCreditsError,
} from './application/queries/get-portal-credits';

export {
  LISTING_INTENTS,
  LISTING_OPERATIONS,
  LISTING_STATUSES,
  LISTING_TYPES,
  Listing,
  ownerAvailability,
  type ListingClosedError,
  type ListingId,
  type ListingIntent,
  type ListingNotClosedError,
  type ListingOperation,
  type ListingSnapshot,
  type ListingStatus,
  type ListingSyncStep,
  type ListingType,
  type OwnerAvailability,
} from './domain/listing';
export type {
  ListingEvent,
  ListingSyncFailed,
  ListingSyncRequested,
} from './domain/listing.events';
export type { ListingRepository } from './domain/portals.repository';
export type {
  ListingPropertyKind,
  ListingSource,
  ListingSourceContact,
  ListingSourceOperation,
  ListingSourcePhoto,
  ListingSourceReader,
} from './application/ports/listing-source';
export type {
  PortalConnector,
  PortalCredentialsMissingError,
  PortalListingContent,
  PortalListingState,
  PortalListingUpdate,
  PortalRejectedError,
  PortalSyncError,
} from './application/ports/portal-connector';
export { contentFingerprint, type ListingNotFoundError } from './application/listing-support';

export {
  RequestPublication,
  type ListingAlreadyExistsError,
  type MissingListingDataError,
  type OperationNotOfferedError,
  type PortalNotEnabledError,
  type PortalNotForPropertiesError,
  type PriceRequiredError,
  type PropertyNotAvailableError,
  type RequestPublicationError,
  type UnitPublishedWithDevelopmentError,
} from './application/commands/request-publication';
export { PauseListing, type PauseListingError } from './application/commands/pause-listing';
export { ResumeListing, type ResumeListingError } from './application/commands/resume-listing';
export {
  UnpublishListing,
  type UnpublishListingError,
} from './application/commands/unpublish-listing';
export {
  ChangeListingType,
  type ChangeListingTypeError,
} from './application/commands/change-listing-type';
export {
  LinkPortalListing,
  type LinkPortalListingError,
  type RemoteListingAlreadyLinkedError,
  type RemoteListingIsDevelopmentError,
  type RemoteListingNotFoundError,
} from './application/commands/link-portal-listing';
export {
  ListRemoteListings,
  type ListRemoteListingsError,
} from './application/queries/list-remote-listings';
export type {
  PortalListingCatalog,
  PropertyByCode,
  PropertyCodeLookup,
  RemoteListing,
} from './application/ports/portal-listing-catalog';
export {
  ChangeListingPlan,
  type ChangeListingPlanError,
} from './application/commands/change-listing-plan';
export type {
  ListingPlanError,
  NoCreditsLeftError,
  PlanNotOfferedError,
  PlanRequiredError,
} from './application/listing-plan';
export { ResyncListing, type ResyncListingError } from './application/commands/resync-listing';
export {
  RequestListingSync,
  type RequestListingSyncError,
} from './application/commands/request-listing-sync';
export {
  SyncListing,
  type SyncListingError,
  type SyncListingOutcome,
} from './application/commands/sync-listing';
export {
  GetPropertyListings,
  type GetPropertyListingsError,
} from './application/queries/get-property-listings';
