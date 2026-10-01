import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ResetUserPasswordInputSchema, type ResetUserPasswordInput } from '../../contracts';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { PasswordHasher } from '../ports/password-hasher';
import { userTarget, type InvalidInputError, type UserNotFoundError } from '../user-audit';
import { findUser } from '../user-lookup';

export type ResetUserPasswordError = ForbiddenError | InvalidInputError | UserNotFoundError;

/**
 * Blanqueo: un administrador le pone una contraseña temporal (no hay recuperación por mail). Se
 * cierran sus sesiones y en el próximo ingreso tiene que elegir una propia.
 */
export class ResetUserPassword {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      readonly hasher: PasswordHasher;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ResetUserPasswordInput,
    actor: Actor,
  ): Promise<Result<void, ResetUserPasswordError>> {
    if (!actor.can('users:reset-password')) return err({ type: 'Forbidden' });

    const parsed = ResetUserPasswordInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const passwordHash = await this.deps.hasher.hash(parsed.data.temporaryPassword);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ResetUserPasswordError>> => {
      const user = await findUser(tx.users, parsed.data.userId);
      if (!user) return err({ type: 'UserNotFound' });

      user.resetPassword(now);
      await tx.users.save(user, actor.id);
      await tx.credentials.setPasswordHash(user.id, passwordHash);
      await tx.sessions.revokeAll(user.id);
      await tx.events.publish(user.pullEvents());
      await tx.audit.record(auditAction(actor, userTarget('user.password-reset', user.id)));
      return ok(undefined);
    });
  }
}
