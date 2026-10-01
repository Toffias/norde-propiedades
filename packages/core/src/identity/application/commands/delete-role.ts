import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RoleIdInputSchema, type RoleIdInput } from '../../contracts';
import type {
  RoleAlreadyDeletedError,
  RoleInUseError,
  SystemRoleCannotBeDeletedError,
} from '../../domain/role';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import { roleTarget } from '../role-audit';
import { findRole } from '../role-lookup';
import type { InvalidInputError, RoleNotFoundError } from '../user-audit';

export type DeleteRoleError =
  | ForbiddenError
  | InvalidInputError
  | RoleNotFoundError
  | SystemRoleCannotBeDeletedError
  | RoleInUseError
  | RoleAlreadyDeletedError;

/** Manda un rol sin usuarios a la papelera (baja lógica). */
export class DeleteRole {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: RoleIdInput, actor: Actor): Promise<Result<void, DeleteRoleError>> {
    if (!actor.can('roles:delete')) return err({ type: 'Forbidden' });

    const parsed = RoleIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteRoleError>> => {
      const role = await findRole(tx.roles, parsed.data.roleId);
      if (!role) return err({ type: 'RoleNotFound' });

      const deleted = role.delete(await tx.roles.countUsers(role.id), now);
      if (deleted.isErr()) return err(deleted.error);

      await tx.roles.save(role, actor.id);
      await tx.events.publish(role.pullEvents());
      await tx.audit.record(auditAction(actor, roleTarget('role.deleted', role.id)));
      return ok(undefined);
    });
  }
}
