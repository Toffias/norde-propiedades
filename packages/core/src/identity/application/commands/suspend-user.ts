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
import { UserIdInputSchema, type UserIdInput } from '../../contracts';
import type { CannotSuspendSelfError, UserAlreadySuspendedError } from '../../domain/user';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import {
  userAuditState,
  userTarget,
  type InvalidInputError,
  type UserNotFoundError,
} from '../user-audit';
import { findUser } from '../user-lookup';

export type SuspendUserError =
  | ForbiddenError
  | InvalidInputError
  | UserNotFoundError
  | CannotSuspendSelfError
  | UserAlreadySuspendedError;

/** Suspende el acceso de un usuario al panel y cierra sus sesiones abiertas. */
export class SuspendUser {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: UserIdInput, actor: Actor): Promise<Result<void, SuspendUserError>> {
    if (!actor.can('users:suspend')) return err({ type: 'Forbidden' });

    const parsed = UserIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SuspendUserError>> => {
      const user = await findUser(tx.users, parsed.data.userId);
      if (!user) return err({ type: 'UserNotFound' });

      const before = userAuditState(user);
      const suspended = user.suspend(actor.id, now);
      if (suspended.isErr()) return err(suspended.error);

      await tx.users.save(user, actor.id);
      await tx.sessions.revokeAll(user.id);
      await tx.events.publish(user.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          userTarget('user.suspended', user.id),
          diffChanges(before, userAuditState(user)),
        ),
      );
      return ok(undefined);
    });
  }
}
