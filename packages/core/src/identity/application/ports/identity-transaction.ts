import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { BranchRepository, TeamRepository } from '../../domain/organization.repository';
import type { RoleRepository } from '../../domain/role.repository';
import type { UserRepository } from '../../domain/user.repository';

import type { UserFavorites } from './user-favorites';

/** Contraseña del usuario (la cuenta `credential` del proveedor de autenticación), ya hasheada. */
export interface CredentialStore {
  findPasswordHash(userId: string): Promise<string | undefined>;
  setPasswordHash(userId: string, hash: string): Promise<void>;
}

/** Sesiones abiertas de un usuario en el panel. */
export interface UserSessions {
  /** Cierra todas: el próximo request de ese usuario vuelve al login. */
  revokeAll(userId: string): Promise<void>;
}

/** Lo que un command de identity usa dentro de la transacción, ligado a la misma conexión. */
export interface IdentityTransaction {
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly branches: BranchRepository;
  readonly teams: TeamRepository;
  readonly credentials: CredentialStore;
  readonly sessions: UserSessions;
  readonly favorites: UserFavorites;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type IdentityUnitOfWork = UnitOfWork<IdentityTransaction>;
