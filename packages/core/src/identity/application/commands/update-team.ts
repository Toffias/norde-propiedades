import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateTeamInputSchema, type UpdateTeamInput } from '../../contracts';
import { findTeam, teamAuditState, teamTarget } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type {
  BranchNotFoundError,
  InvalidInputError,
  NameTakenError,
  TeamNotFoundError,
} from '../user-audit';

export type UpdateTeamError =
  ForbiddenError | InvalidInputError | TeamNotFoundError | BranchNotFoundError | NameTakenError;

/** Cambia el nombre o la sucursal de un equipo. */
export class UpdateTeam {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: UpdateTeamInput, actor: Actor): Promise<Result<void, UpdateTeamError>> {
    if (!actor.can('teams:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateTeamInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { teamId, name, branchId } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateTeamError>> => {
      const team = await findTeam(tx.teams, teamId);
      if (!team || team.isDeleted) return err({ type: 'TeamNotFound' });
      if (branchId !== undefined && (await tx.branches.findExistingIds([branchId])).length === 0) {
        return err({ type: 'BranchNotFound' });
      }
      const sameName = await tx.teams.findActiveByName(name);
      if (sameName && sameName.id !== team.id) return err({ type: 'NameTaken' });

      const before = teamAuditState(team);
      team.update({ name, branchId }, now);
      const entry = auditUpdated(
        actor,
        teamTarget('team.updated', team.id),
        before,
        teamAuditState(team),
      );
      if (!entry) return ok(undefined);

      await tx.teams.save(team, actor.id);
      await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
