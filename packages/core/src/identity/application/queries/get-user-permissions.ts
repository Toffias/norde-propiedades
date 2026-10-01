import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { UserIdInputSchema, type UserIdInput, type UserPermissionsDetail } from '../../contracts';
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

    return ok({
      userId: user.id,
      name: user.name,
      rolePermissions: [...new Set(user.rolePermissions)].sort(),
      ownPermissions: user.userPermissions,
    });
  }
}
