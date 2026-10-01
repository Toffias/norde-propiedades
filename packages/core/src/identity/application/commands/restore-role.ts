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
import type { RoleNotDeletedError } from '../../domain/role';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import { roleTarget } from '../role-audit';
import { findRole } from '../role-lookup';
import type { InvalidInputError, RoleNotFoundError } from '../user-audit';

export type RestoreRoleError =
  ForbiddenError | InvalidInputError | RoleNotFoundError | RoleNotDeletedError;

/** Saca un rol de la papelera. */
export class RestoreRole {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: RoleIdInput, actor: Actor): Promise<Result<void, RestoreRoleError>> {
    if (!actor.can('roles:delete')) return err({ type: 'Forbidden' });

    const parsed = RoleIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreRoleError>> => {
      const role = await findRole(tx.roles, parsed.data.roleId);
      if (!role) return err({ type: 'RoleNotFound' });

      const restored = role.restoreFromTrash(now);
      if (restored.isErr()) return err(restored.error);

      await tx.roles.save(role, actor.id);
      await tx.events.publish(role.pullEvents());
      await tx.audit.record(auditAction(actor, roleTarget('role.restored', role.id)));
      return ok(undefined);
    });
  }
}
