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
import type { BranchNotDeletedError } from '../../domain/branch';
import { branchTarget, findBranch } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { BranchNotFoundError, InvalidInputError, NameTakenError } from '../user-audit';

export type RestoreBranchError =
  ForbiddenError | InvalidInputError | BranchNotFoundError | BranchNotDeletedError | NameTakenError;

/** Saca una sucursal de la papelera, si su nombre no lo tomó otra mientras tanto. */
export class RestoreBranch {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: BranchIdInput, actor: Actor): Promise<Result<void, RestoreBranchError>> {
    if (!actor.can('branches:delete')) return err({ type: 'Forbidden' });

    const parsed = BranchIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreBranchError>> => {
      const branch = await findBranch(tx.branches, parsed.data.branchId);
      if (!branch) return err({ type: 'BranchNotFound' });
      if (branch.isDeleted && (await tx.branches.findActiveByName(branch.name))) {
        return err({ type: 'NameTaken' });
      }

      const restored = branch.restoreFromTrash(now);
      if (restored.isErr()) return err(restored.error);

      await tx.branches.save(branch, actor.id);
      await tx.events.publish(branch.pullEvents());
      await tx.audit.record(auditAction(actor, branchTarget('branch.restored', branch.id)));
      return ok(undefined);
    });
  }
}
