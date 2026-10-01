import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import { CreateBranchInputSchema, type CreateBranchInput } from '../../contracts';
import { Branch } from '../../domain/branch';
import { branchAuditState, branchContact, branchTarget } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { InvalidInputError, NameTakenError } from '../user-audit';

export type CreateBranchError =
  ForbiddenError | InvalidInputError | InvalidEmailError | InvalidPhoneError | NameTakenError;

/** Sucursal nueva. Si todavía no hay casa central, esta lo es. */
export class CreateBranch {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateBranchInput,
    actor: Actor,
  ): Promise<Result<{ readonly branchId: string }, CreateBranchError>> {
    if (!actor.can('branches:create')) return err({ type: 'Forbidden' });

    const parsed = CreateBranchInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const contact = branchContact(parsed.data);
    if (contact.isErr()) return err(contact.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly branchId: string }, CreateBranchError>> => {
        if (await tx.branches.findActiveByName(contact.value.name)) {
          return err({ type: 'NameTaken' });
        }
        const branch = Branch.create({
          id: nextId<'Branch'>(this.deps.ids),
          ...contact.value,
          isFirst: (await tx.branches.findMain()) === undefined,
          now,
        });

        await tx.branches.save(branch, actor.id);
        await tx.events.publish(branch.pullEvents());
        await tx.audit.record(
          auditCreated(actor, branchTarget('branch.created', branch.id), branchAuditState(branch)),
        );
        return ok({ branchId: branch.id });
      },
    );
  }
}
