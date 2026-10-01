import { parseId } from '../../shared';
import type { Role } from '../domain/role';
import type { RoleRepository } from '../domain/role.repository';

/** Busca un rol por un ID que llegó de afuera (ya validado como UUID por el contract). */
export async function findRole(roles: RoleRepository, rawId: string): Promise<Role | undefined> {
  const id = parseId<'Role'>(rawId);
  return id.isOk() ? roles.findById(id.value) : undefined;
}
