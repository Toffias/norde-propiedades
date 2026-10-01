import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type InvalidEmailError,
  type InvalidPhoneError,
  type Result,
} from '../../../shared';
import { UpdateBranchInputSchema, type UpdateBranchInput } from '../../contracts';
import { branchAuditState, branchContact, branchTarget, findBranch } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { BranchNotFoundError, InvalidInputError, NameTakenError } from '../user-audit';

export type UpdateBranchError =
  | ForbiddenError
  | InvalidInputError
  | InvalidEmailError
  | InvalidPhoneError
  | BranchNotFoundError
  | NameTakenError;

/** Edita los datos de contacto de una sucursal. Sin cambios, no se audita nada. */
export class UpdateBranch {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: UpdateBranchInput, actor: Actor): Promise<Result<void, UpdateBranchError>> {
    if (!actor.can('branches:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateBranchInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { branchId, ...data } = parsed.data;
    const contact = branchContact(data);
    if (contact.isErr()) return err(contact.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateBranchError>> => {
      const branch = await findBranch(tx.branches, branchId);
      if (!branch || branch.isDeleted) return err({ type: 'BranchNotFound' });
      const sameName = await tx.branches.findActiveByName(contact.value.name);
      if (sameName && sameName.id !== branch.id) return err({ type: 'NameTaken' });

      const before = branchAuditState(branch);
      branch.update(contact.value, now);
      const entry = auditUpdated(
        actor,
        branchTarget('branch.updated', branch.id),
        before,
        branchAuditState(branch),
      );
      if (!entry) return ok(undefined);

      await tx.branches.save(branch, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
