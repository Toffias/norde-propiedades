import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { TeamIdInputSchema, type TeamIdInput } from '../../contracts';
import type { TeamAlreadyDeletedError } from '../../domain/team';
import { findTeam, teamTarget } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { InvalidInputError, TeamNotFoundError } from '../user-audit';

export type DeleteTeamError =
  ForbiddenError | InvalidInputError | TeamNotFoundError | TeamAlreadyDeletedError;

/** Manda un equipo a la papelera. Sus miembros quedan, para restaurarlo tal cual. */
export class DeleteTeam {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: TeamIdInput, actor: Actor): Promise<Result<void, DeleteTeamError>> {
    if (!actor.can('teams:delete')) return err({ type: 'Forbidden' });

    const parsed = TeamIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteTeamError>> => {
      const team = await findTeam(tx.teams, parsed.data.teamId);
      if (!team) return err({ type: 'TeamNotFound' });

      const deleted = team.delete(now);
      if (deleted.isErr()) return err(deleted.error);

      await tx.teams.save(team, actor.id);
      await tx.events.publish(team.pullEvents());
      await tx.audit.record(auditAction(actor, teamTarget('team.deleted', team.id)));
      return ok(undefined);
    });
  }
}
