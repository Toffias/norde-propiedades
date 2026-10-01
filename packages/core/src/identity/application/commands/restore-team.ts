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
import type { TeamNotDeletedError } from '../../domain/team';
import { findTeam, teamTarget } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { InvalidInputError, NameTakenError, TeamNotFoundError } from '../user-audit';

export type RestoreTeamError =
  ForbiddenError | InvalidInputError | TeamNotFoundError | TeamNotDeletedError | NameTakenError;

/** Saca un equipo de la papelera, si su nombre no lo tomó otro mientras tanto. */
export class RestoreTeam {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: TeamIdInput, actor: Actor): Promise<Result<void, RestoreTeamError>> {
    if (!actor.can('teams:delete')) return err({ type: 'Forbidden' });

    const parsed = TeamIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreTeamError>> => {
      const team = await findTeam(tx.teams, parsed.data.teamId);
      if (!team) return err({ type: 'TeamNotFound' });
      if (team.isDeleted && (await tx.teams.findActiveByName(team.name))) {
        return err({ type: 'NameTaken' });
      }

      const restored = team.restoreFromTrash(now);
      if (restored.isErr()) return err(restored.error);

      await tx.teams.save(team, actor.id);
      await tx.events.publish(team.pullEvents());
      await tx.audit.record(auditAction(actor, teamTarget('team.restored', team.id)));
      return ok(undefined);
    });
  }
}
