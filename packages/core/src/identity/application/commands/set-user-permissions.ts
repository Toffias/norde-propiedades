import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SetUserPermissionsInputSchema, type SetUserPermissionsInput } from '../../contracts';
import type { UnknownPermissionError } from '../../domain/permission-catalog';
import {
  ensureCanManageUser,
  ensureGrantsHeld,
  type PermissionEscalationError,
  type UserHasMorePermissionsError,
} from '../../domain/permission-escalation';
import type { CannotChangeOwnPermissionsError, DuplicatePermissionError } from '../../domain/user';
import { holdsOf, userPermissionsOf } from '../permission-guard';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import {
  userAuditState,
  userTarget,
  type InvalidInputError,
  type UserNotFoundError,
} from '../user-audit';
import { findUser } from '../user-lookup';

export type SetUserPermissionsError =
  | ForbiddenError
  | InvalidInputError
  | UserNotFoundError
  | UnknownPermissionError
  | DuplicatePermissionError
  | CannotChangeOwnPermissionsError
  | UserHasMorePermissionsError
  | PermissionEscalationError;

/**
 * Permisos propios de un usuario, además de los de sus roles: permitir uno que sus roles no dan, o
 * denegar uno que sí. Quien los cambia tiene que tener todo lo que el usuario tiene, y solo puede
 * permitir (o dejar de denegar) lo que él mismo tiene (#221).
 */
export class SetUserPermissions {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: SetUserPermissionsInput,
    actor: Actor,
  ): Promise<Result<void, SetUserPermissionsError>> {
    if (!actor.can('users:permissions')) return err({ type: 'Forbidden' });

    const parsed = SetUserPermissionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SetUserPermissionsError>> => {
      const user = await findUser(tx.users, parsed.data.userId);
      if (!user) return err({ type: 'UserNotFound' });
      const permissionsBefore = await userPermissionsOf(tx.roles, user);
      const managed = ensureCanManageUser(permissionsBefore, holdsOf(actor));
      if (managed.isErr()) return err(managed.error);

      const before = userAuditState(user);
      const set = user.setOwnPermissions(parsed.data.permissions, actor.id, now);
      if (set.isErr()) return err(set.error);
      const held = ensureGrantsHeld(
        await userPermissionsOf(tx.roles, user),
        holdsOf(actor),
        permissionsBefore,
      );
      if (held.isErr()) return err(held.error);

      const changes = diffChanges(before, userAuditState(user));
      if (Object.keys(changes).length === 0) return ok(undefined);

      await tx.users.save(user, actor.id);
      await tx.events.publish(user.pullEvents());
      await tx.audit.record(
        auditAction(actor, userTarget('user.permissions-changed', user.id), changes),
      );
      return ok(undefined);
    });
  }
}
