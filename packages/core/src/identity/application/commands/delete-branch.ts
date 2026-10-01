import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { BranchIdInputSchema, type BranchIdInput } from '../../contracts';
import type {
  BranchAlreadyDeletedError,
  BranchHasMembersError,
  BranchHasTeamsError,
  MainBranchCannotBeDeletedError,
} from '../../domain/branch';
import { branchTarget, findBranch } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { BranchNotFoundError, InvalidInputError } from '../user-audit';

export type DeleteBranchError =
  | ForbiddenError
  | InvalidInputError
  | BranchNotFoundError
  | MainBranchCannotBeDeletedError
  | BranchHasMembersError
  | BranchHasTeamsError
  | BranchAlreadyDeletedError;

/** Manda a la papelera una sucursal sin usuarios ni equipos. */
export class DeleteBranch {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: BranchIdInput, actor: Actor): Promise<Result<void, DeleteBranchError>> {
    if (!actor.can('branches:delete')) return err({ type: 'Forbidden' });

    const parsed = BranchIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteBranchError>> => {
      const branch = await findBranch(tx.branches, parsed.data.branchId);
      if (!branch) return err({ type: 'BranchNotFound' });

      const deleted = branch.delete(
        {
          userCount: await tx.branches.countUsers(branch.id),
          teamCount: await tx.branches.countTeams(branch.id),
        },
        now,
      );
      if (deleted.isErr()) return err(deleted.error);

      await tx.branches.save(branch, actor.id);
      await tx.events.publish(branch.pullEvents());
      await tx.audit.record(auditAction(actor, branchTarget('branch.deleted', branch.id)));
      return ok(undefined);
    });
  }
}
