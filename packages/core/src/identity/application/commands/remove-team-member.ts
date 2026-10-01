import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { TeamMemberInputSchema, type TeamMemberInput } from '../../contracts';
import type { TeamDeletedError } from '../../domain/team';
import { findTeam, teamTarget } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { InvalidInputError, TeamNotFoundError } from '../user-audit';

export type RemoveTeamMemberError =
  ForbiddenError | InvalidInputError | TeamNotFoundError | TeamDeletedError;

/** Saca a un usuario de un equipo. Si no estaba, no hace nada. */
export class RemoveTeamMember {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: TeamMemberInput,
    actor: Actor,
  ): Promise<Result<void, RemoveTeamMemberError>> {
    if (!actor.can('teams:update')) return err({ type: 'Forbidden' });

    const parsed = TeamMemberInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }

    return this.deps.uow.run(async (tx): Promise<Result<void, RemoveTeamMemberError>> => {
      const team = await findTeam(tx.teams, parsed.data.teamId);
      if (!team) return err({ type: 'TeamNotFound' });
      const active = team.ensureActive();
      if (active.isErr()) return err(active.error);
      const { userId } = parsed.data;
      if (!(await tx.teams.isMember(team.id, userId))) return ok(undefined);

      await tx.teams.removeMember(team.id, userId);
      await tx.audit.record(
        auditAction(actor, teamTarget('team.member-removed', team.id), {
          userId: { before: userId, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
