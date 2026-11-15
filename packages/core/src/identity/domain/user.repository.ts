import type { Email } from '../../shared/domain/value-objects/email';

import type { User, UserId } from './user';

export interface UserRepository {
  findById(id: UserId): Promise<User | undefined>;
  findByEmail(email: Email): Promise<User | undefined>;
  /** Mismo nombre sin distinguir mayúsculas ni acentos (también los suspendidos). */
  findByName(name: string): Promise<User | undefined>;
  /** El que está marcado como asesor por defecto (#208), si hay. */
  findDefaultAssignee(): Promise<User | undefined>;
  /**
   * Cuántos administradores hay (`isAdministrator`): activos, con el rol `adminRoleId` y sin
   * ninguno de `blockingDenials` negado. Bloquea hasta el final de la transacción a las demás que
   * lo pidan, para que dos administradores no se suspendan entre sí a la vez.
   */
  countAdministrators(adminRoleId: string, blockingDenials: readonly string[]): Promise<number>;
  /** `actorId` queda como autor del alta o de la edición (`created_by` / `updated_by`). */
  save(user: User, actorId: string): Promise<void>;
}
