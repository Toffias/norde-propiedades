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
import { branchTarget, findBranch } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { BranchNotFoundError, InvalidInputError } from '../user-audit';

export type MakeMainBranchError = ForbiddenError | InvalidInputError | BranchNotFoundError;

/** Cambia la casa central: la nueva queda marcada y la anterior deja de serlo. */
export class MakeMainBranch {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: BranchIdInput, actor: Actor): Promise<Result<void, MakeMainBranchError>> {
    if (!actor.can('branches:update')) return err({ type: 'Forbidden' });

    const parsed = BranchIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, MakeMainBranchError>> => {
      const branch = await findBranch(tx.branches, parsed.data.branchId);
      if (!branch || branch.isDeleted) return err({ type: 'BranchNotFound' });
      if (branch.isMain) return ok(undefined);

      const previous = await tx.branches.findMain();
      if (previous) {
        previous.stopBeingMain(now);
        await tx.branches.save(previous, actor.id);
      }
      branch.makeMain(now);
      await tx.branches.save(branch, actor.id);
      await tx.events.publish(branch.pullEvents());
      await tx.audit.record(
        auditAction(actor, branchTarget('branch.made-main', branch.id), {
          // La anterior, por ID: el historial muestra de cuál a cuál.
          previousMainId: { before: previous?.id ?? null, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
