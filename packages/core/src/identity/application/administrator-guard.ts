import { err, ok, type Result } from '../../shared';
import {
  ADMIN_BLOCKING_DENIALS,
  ADMIN_ROLE_KEY,
  isAdministrator,
  type LastAdministratorError,
} from '../domain/administrators';
import type { RoleRepository } from '../domain/role.repository';
import type { User } from '../domain/user';
import type { UserRepository } from '../domain/user.repository';

/**
 * Antes de un cambio que puede dejar a un usuario sin la administración (suspenderlo, sacarle el
 * rol, negarle un permiso): devuelve una función que, con el usuario ya cambiado, rechaza el
 * cambio si era el último administrador. La cuenta bloquea a las demás transacciones que la piden.
 */
export async function guardLastAdministrator(
  repositories: { readonly users: UserRepository; readonly roles: RoleRepository },
  user: User,
): Promise<(changed: User) => Promise<Result<void, LastAdministratorError>>> {
  const adminRole = await repositories.roles.findByKey(ADMIN_ROLE_KEY);
  const wasAdministrator = adminRole !== undefined && isAdministrator(user, adminRole.id);

  return async (changed) => {
    if (!adminRole || !wasAdministrator || isAdministrator(changed, adminRole.id)) {
      return ok(undefined);
    }
    const administrators = await repositories.users.countAdministrators(
      adminRole.id,
      ADMIN_BLOCKING_DENIALS,
    );
    return administrators <= 1 ? err({ type: 'LastAdministrator' }) : ok(undefined);
  };
}
