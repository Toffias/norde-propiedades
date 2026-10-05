// API pública del módulo portals (`@norde/core/portals`).

export * from './contracts';

export {
  LISTING_OWNER_KINDS,
  PORTAL_CATALOG,
  PORTALS,
  isPortalId,
  type ListingOwnerKind,
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
