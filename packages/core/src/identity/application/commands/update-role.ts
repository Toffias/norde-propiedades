import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateRoleInputSchema, type UpdateRoleInput } from '../../contracts';
import type { UnknownPermissionError } from '../../domain/permission-catalog';
import type { SystemRoleCannotBeRenamedError } from '../../domain/role';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import { roleAuditState, roleTarget } from '../role-audit';
import { findRole } from '../role-lookup';
import type { InvalidInputError, RoleNameTakenError, RoleNotFoundError } from '../user-audit';

export type UpdateRoleError =
  | ForbiddenError
  | InvalidInputError
  | RoleNotFoundError
  | UnknownPermissionError
  | SystemRoleCannotBeRenamedError
  | RoleNameTakenError;

/**
 * Edita el nombre, la descripción y los permisos de un rol. El cambio de permisos alcanza a todos
 * sus usuarios desde su próximo request (la sesión se arma en cada uno). La clave no cambia.
 */
export class UpdateRole {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: UpdateRoleInput, actor: Actor): Promise<Result<void, UpdateRoleError>> {
    if (!actor.can('roles:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateRoleInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { roleId, ...data } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateRoleError>> => {
      const role = await findRole(tx.roles, roleId);
      if (!role || role.isDeleted) return err({ type: 'RoleNotFound' });

      // Otro rol con el mismo nombre confundiría la grilla.
      const sameName = await tx.roles.findByName(data.name);
      if (sameName && sameName.id !== role.id) return err({ type: 'RoleNameTaken' });

      const before = roleAuditState(role);
      const updated = role.update(
        { name: data.name, description: data.description, permissions: data.permissions },
        now,
      );
      if (updated.isErr()) return err(updated.error);

      const entry = auditUpdated(
        actor,
        roleTarget('role.updated', role.id),
        before,
        roleAuditState(role),
      );
      if (!entry) return ok(undefined);

      await tx.roles.save(role, actor.id);
      await tx.events.publish(role.pullEvents());
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
