import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { BranchIdInputSchema, type BranchDetail, type BranchIdInput } from '../../contracts';
import type { OrganizationQuery } from '../ports/organization-query';
import type { BranchNotFoundError, InvalidInputError } from '../user-audit';

export type GetBranchError = ForbiddenError | InvalidInputError | BranchNotFoundError;

/** Una sucursal con sus datos de contacto. */
export class GetBranch {
  constructor(private readonly deps: { readonly organization: OrganizationQuery }) {}

  async execute(input: BranchIdInput, actor: Actor): Promise<Result<BranchDetail, GetBranchError>> {
    if (!actor.can('branches:read')) return err({ type: 'Forbidden' });

    const parsed = BranchIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const branch = await this.deps.organization.findBranch(parsed.data.branchId);
    return branch ? ok(branch) : err({ type: 'BranchNotFound' });
  }
}
