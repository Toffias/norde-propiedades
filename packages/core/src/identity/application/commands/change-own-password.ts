import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ChangeOwnPasswordInputSchema, type ChangeOwnPasswordInput } from '../../contracts';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { PasswordHasher } from '../ports/password-hasher';
import { userTarget, type InvalidInputError, type UserNotFoundError } from '../user-audit';
import { findUser } from '../user-lookup';

export type ChangeOwnPasswordError =
  | ForbiddenError
  | InvalidInputError
  | UserNotFoundError
  | { readonly type: 'WrongPassword' }
  | { readonly type: 'SamePassword' };

/**
 * El usuario de la sesión cambia su contraseña. No pide permisos: cualquier usuario puede, incluso
 * con una contraseña temporal (es lo único que puede hacer hasta cambiarla).
 */
export class ChangeOwnPassword {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      readonly hasher: PasswordHasher;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ChangeOwnPasswordInput,
    actor: Actor,
  ): Promise<Result<void, ChangeOwnPasswordError>> {
    if (actor.kind !== 'user') return err({ type: 'Forbidden' });

    const parsed = ChangeOwnPasswordInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { currentPassword, newPassword } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ChangeOwnPasswordError>> => {
      const user = await findUser(tx.users, actor.id);
      if (!user) return err({ type: 'UserNotFound' });

      const currentHash = await tx.credentials.findPasswordHash(user.id);
      const matches =
        currentHash !== undefined && (await this.deps.hasher.verify(currentHash, currentPassword));
      if (!matches) return err({ type: 'WrongPassword' });
      // La temporal la conoce el administrador que la puso: tiene que ser otra.
      if (await this.deps.hasher.verify(currentHash, newPassword)) {
        return err({ type: 'SamePassword' });
      }

      user.passwordChanged(now);
      await tx.users.save(user, actor.id);
      await tx.credentials.setPasswordHash(user.id, await this.deps.hasher.hash(newPassword));
      await tx.audit.record(auditAction(actor, userTarget('user.password-changed', user.id)));
      return ok(undefined);
    });
  }
}
