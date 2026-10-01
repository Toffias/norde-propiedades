import { Actor, err, ok, type ForbiddenError, type Result } from '../../../shared';
import { UserIdInputSchema, type UserIdInput, type UserPermissionsDetail } from '../../contracts';
import { PERMISSION_CATALOG } from '../../domain/permission-catalog';
import type { UserAccessQuery } from '../ports/user-access-query';
import type { InvalidInputError, UserNotFoundError } from '../user-audit';

export type GetUserPermissionsError = ForbiddenError | InvalidInputError | UserNotFoundError;

/** Los permisos que le dan sus roles y los propios, para el editor de permisos del usuario. */
export class GetUserPermissions {
  constructor(private readonly deps: { readonly users: UserAccessQuery }) {}

  async execute(
    input: UserIdInput,
    actor: Actor,
  ): Promise<Result<UserPermissionsDetail, GetUserPermissionsError>> {
    if (!actor.can('users:permissions')) return err({ type: 'Forbidden' });

    const parsed = UserIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const user = await this.deps.users.findByUserId(parsed.data.userId);
    if (!user) return err({ type: 'UserNotFound' });

    // La misma regla que la sesión: un permiso del rol, o el `recurso:*` que lo cubre.
    const roles = Actor.user(user.id, user.rolePermissions);
    const grantedByRoles = PERMISSION_CATALOG.flatMap((group) =>
      group.resources.flatMap((resource) => resource.permissions.map((p) => p.permission)),
    ).filter((permission) => roles.can(permission));

    return ok({
      userId: user.id,
      name: user.name,
      rolePermissions: [...new Set(user.rolePermissions)].sort(),
      grantedByRoles,
      ownPermissions: user.userPermissions,
    });
  }
}
