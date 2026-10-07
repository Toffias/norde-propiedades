import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { PortalId } from '../../domain/portal';
import type { ListingRepository, PortalAccountRepository } from '../../domain/portals.repository';
import type { PortalCredentials } from './portal-authorizer';

/** Credenciales de cada cuenta, cifradas por infra. Nunca se guardan ni se loguean en claro. */
export interface PortalCredentialStore {
  save(portal: PortalId, credentials: PortalCredentials): Promise<void>;
  delete(portal: PortalId): Promise<void>;
}

/** Lo que un command de portals usa dentro de la transacción, ligado a la misma conexión. */
export interface PortalsTransaction {
  readonly accounts: PortalAccountRepository;
  readonly credentials: PortalCredentialStore;
  readonly listings: ListingRepository;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type PortalsUnitOfWork = UnitOfWork<PortalsTransaction>;
