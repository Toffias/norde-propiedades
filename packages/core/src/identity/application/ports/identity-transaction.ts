import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { UserRepository } from '../../domain/user.repository';

/** Qué roles existen, para validar los que se asignan. */
export interface RoleDirectory {
  /** De los IDs pedidos, los que existen. */
  findExistingIds(ids: readonly string[]): Promise<readonly string[]>;
}

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
  readonly roles: RoleDirectory;
  readonly credentials: CredentialStore;
  readonly sessions: UserSessions;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type IdentityUnitOfWork = UnitOfWork<IdentityTransaction>;
