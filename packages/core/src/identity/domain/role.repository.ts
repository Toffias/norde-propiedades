import type { Role, RoleId } from './role';

export interface RoleRepository {
  /** También los que están en la papelera. */
  findById(id: RoleId): Promise<Role | undefined>;
  findByKey(key: string): Promise<Role | undefined>;
  /** Mismo nombre sin distinguir mayúsculas ni acentos (también en la papelera). */
  findByName(name: string): Promise<Role | undefined>;
  /** De los IDs pedidos, los de roles que existen y no están en la papelera. */
  findExistingIds(ids: readonly string[]): Promise<readonly string[]>;
  countUsers(id: RoleId): Promise<number>;
  /** `actorId` queda como autor del alta o de la edición (`created_by` / `updated_by`). */
  save(role: Role, actorId: string): Promise<void>;
}
