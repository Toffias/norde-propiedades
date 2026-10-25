import {
  auditAction,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UserIdInputSchema, type UserIdInput } from '../../contracts';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import { userTarget, type InvalidInputError, type UserNotFoundError } from '../user-audit';
import { findUser } from '../user-lookup';

export type ResetUserTwoFactorError =
  ForbiddenError | InvalidInputError | UserNotFoundError | { readonly type: 'TwoFactorNotEnabled' };

/**
 * Un administrador le quita la verificación en dos pasos a un usuario que perdió el celular y los
 * códigos de respaldo (#113). Vuelve a entrar solo con la contraseña y puede activarla de nuevo.
 * Pide el mismo permiso que el blanqueo de contraseña: las dos devuelven el acceso a la cuenta.
 */
export class ResetUserTwoFactor {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork }) {}

  async execute(input: UserIdInput, actor: Actor): Promise<Result<void, ResetUserTwoFactorError>> {
    if (!actor.can('users:reset-password')) return err({ type: 'Forbidden' });

    const parsed = UserIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }

    return this.deps.uow.run(async (tx): Promise<Result<void, ResetUserTwoFactorError>> => {
      const user = await findUser(tx.users, parsed.data.userId);
      if (!user) return err({ type: 'UserNotFound' });
      if (!(await tx.credentials.hasTwoFactor(user.id))) {
        return err({ type: 'TwoFactorNotEnabled' });
      }

      await tx.credentials.removeTwoFactor(user.id);
      await tx.audit.record(auditAction(actor, userTarget('user.two-factor-reset', user.id)));
      return ok(undefined);
    });
  }
}
