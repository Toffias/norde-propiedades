import {
  auditCreated,
  Email,
  err,
  nextId,
  ok,
  Phone,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import { CreateUserInputSchema, type CreateUserInput } from '../../contracts';
import { User, type UserNeedsRoleError } from '../../domain/user';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { PasswordHasher } from '../ports/password-hasher';
import {
  userAuditState,
  userTarget,
  type EmailTakenError,
  type InvalidInputError,
  type RoleNotFoundError,
} from '../user-audit';

export type CreateUserError =
  | ForbiddenError
  | InvalidInputError
  | InvalidEmailError
  | InvalidPhoneError
  | EmailTakenError
  | RoleNotFoundError
  | UserNeedsRoleError;

/** Alta de un usuario del panel con una contraseña temporal y sus roles. */
export class CreateUser {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      readonly hasher: PasswordHasher;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateUserInput,
    actor: Actor,
  ): Promise<Result<{ readonly userId: string }, CreateUserError>> {
    if (!actor.can('users:create')) return err({ type: 'Forbidden' });

    const parsed = CreateUserInputSchema.safeParse(input);
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
    const passwordHash = await this.deps.hasher.hash(data.temporaryPassword);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly userId: string }, CreateUserError>> => {
        if (await tx.users.findByEmail(email.value)) return err({ type: 'EmailTaken' });
        const existing = await tx.roles.findExistingIds(data.roleIds);
        if (data.roleIds.some((id) => !existing.includes(id))) return err({ type: 'RoleNotFound' });

        const created = User.create({
          id: nextId<'User'>(this.deps.ids),
          name: data.name,
          email: email.value,
          phone,
          roleIds: data.roleIds,
          now,
        });
        if (created.isErr()) return err(created.error);
        const user = created.value;

        await tx.users.save(user, actor.id);
        await tx.credentials.setPasswordHash(user.id, passwordHash);
        await tx.events.publish(user.pullEvents());
        await tx.audit.record(
          auditCreated(actor, userTarget('user.created', user.id), userAuditState(user)),
        );
        return ok({ userId: user.id });
      },
    );
  }
}
