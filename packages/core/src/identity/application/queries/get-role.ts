import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { RoleIdInputSchema, type RoleDetail, type RoleIdInput } from '../../contracts';
import type { RoleListQuery } from '../ports/role-list-query';
import type { InvalidInputError, RoleNotFoundError } from '../user-audit';

export type GetRoleError = ForbiddenError | InvalidInputError | RoleNotFoundError;

/** Un rol con todos sus permisos, para el editor. */
export class GetRole {
  constructor(private readonly deps: { readonly roles: RoleListQuery }) {}

  async execute(input: RoleIdInput, actor: Actor): Promise<Result<RoleDetail, GetRoleError>> {
    if (!actor.can('roles:read')) return err({ type: 'Forbidden' });

    const parsed = RoleIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const role = await this.deps.roles.findById(parsed.data.roleId);
    return role ? ok(role) : err({ type: 'RoleNotFound' });
  }
}
