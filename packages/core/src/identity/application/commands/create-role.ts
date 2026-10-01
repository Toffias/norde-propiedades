import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CreateRoleInputSchema, type CreateRoleInput } from '../../contracts';
import type { UnknownPermissionError } from '../../domain/permission-catalog';
import { Role } from '../../domain/role';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import { roleAuditState, roleTarget } from '../role-audit';
import type { InvalidInputError, RoleNameTakenError } from '../user-audit';

export type CreateRoleError =
  ForbiddenError | InvalidInputError | UnknownPermissionError | RoleNameTakenError;

/** Rol nuevo con sus permisos del catálogo. */
export class CreateRole {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateRoleInput,
    actor: Actor,
  ): Promise<Result<{ readonly roleId: string }, CreateRoleError>> {
    if (!actor.can('roles:create')) return err({ type: 'Forbidden' });

    const parsed = CreateRoleInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly roleId: string }, CreateRoleError>> => {
        const created = Role.create({ id: nextId<'Role'>(this.deps.ids), ...parsed.data, now });
        if (created.isErr()) return err(created.error);
        const role = created.value;
        // Dos roles con el mismo nombre (aunque uno esté en la papelera) se confundirían en la grilla;
        // la clave sale del nombre y también es única.
        const taken =
          (await tx.roles.findByName(role.name)) ?? (await tx.roles.findByKey(role.key));
        if (taken) return err({ type: 'RoleNameTaken' });

        await tx.roles.save(role, actor.id);
        await tx.events.publish(role.pullEvents());
        await tx.audit.record(
          auditCreated(actor, roleTarget('role.created', role.id), roleAuditState(role)),
        );
        return ok({ roleId: role.id });
      },
    );
  }
}
