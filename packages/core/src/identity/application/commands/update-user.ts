import {
  auditUpdated,
  Email,
  err,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import { UpdateUserInputSchema, type UpdateUserInput } from '../../contracts';
import type { UserNeedsRoleError } from '../../domain/user';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import {
  userAuditState,
  userTarget,
  type BranchNotFoundError,
  type EmailTakenError,
  type InvalidInputError,
  type RoleNotFoundError,
  type UserNotFoundError,
} from '../user-audit';
import { findUser } from '../user-lookup';

export type UpdateUserError =
  | ForbiddenError
  | InvalidInputError
  | InvalidEmailError
  | InvalidPhoneError
  | UserNotFoundError
  | EmailTakenError
  | RoleNotFoundError
  | BranchNotFoundError
  | UserNeedsRoleError;

/** Edita los datos de un usuario y sus roles. Sin cambios, no se guarda ni se audita nada. */
export class UpdateUser {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: UpdateUserInput, actor: Actor): Promise<Result<void, UpdateUserError>> {
    if (!actor.can('users:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateUserInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const data = parsed.data;

    const email = Email.create(data.email);
    if (email.isErr()) return err(email.error);
    let phone: Phone | undefined;
    if (data.phone !== undefined) {
      const created = Phone.create(data.phone);
      if (created.isErr()) return err(created.error);
      phone = created.value;
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateUserError>> => {
      const user = await findUser(tx.users, data.userId);
      if (!user) return err({ type: 'UserNotFound' });

      if (!user.email.equals(email.value)) {
        const other = await tx.users.findByEmail(email.value);
        if (other && other.id !== user.id) return err({ type: 'EmailTaken' });
      }
      const existing = await tx.roles.findExistingIds(data.roleIds);
      if (data.roleIds.some((id) => !existing.includes(id))) return err({ type: 'RoleNotFound' });
      if (data.branchId !== undefined) {
        const branches = await tx.branches.findExistingIds([data.branchId]);
        if (branches.length === 0) return err({ type: 'BranchNotFound' });
      }

      const before = userAuditState(user);
      user.updateProfile(
        { name: data.name, email: email.value, phone, branchId: data.branchId },
        now,
      );
      const assigned = user.assignRoles(data.roleIds, now);
      if (assigned.isErr()) return err(assigned.error);

      const entry = auditUpdated(
        actor,
        userTarget('user.updated', user.id),
        before,
        userAuditState(user),
      );
      if (!entry) return ok(undefined);

      await tx.users.save(user, actor.id);
      await tx.events.publish(user.pullEvents());
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
