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
import type { InvalidInputError, TeamNotFoundError, UserNotFoundError } from '../user-audit';
import { findUser } from '../user-lookup';

export type AddTeamMemberError =
  ForbiddenError | InvalidInputError | TeamNotFoundError | TeamDeletedError | UserNotFoundError;

/** Suma un usuario a un equipo. Si ya estaba, no hace nada. Se audita contra el equipo. */
export class AddTeamMember {
  constructor(private readonly deps: { readonly uow: IdentityUnitOfWork; readonly clock: Clock }) {}

  async execute(input: TeamMemberInput, actor: Actor): Promise<Result<void, AddTeamMemberError>> {
    if (!actor.can('teams:update')) return err({ type: 'Forbidden' });

    const parsed = TeamMemberInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, AddTeamMemberError>> => {
      const team = await findTeam(tx.teams, parsed.data.teamId);
      if (!team) return err({ type: 'TeamNotFound' });
      const active = team.ensureActive();
      if (active.isErr()) return err(active.error);
      const user = await findUser(tx.users, parsed.data.userId);
      if (!user) return err({ type: 'UserNotFound' });
      if (await tx.teams.isMember(team.id, user.id)) return ok(undefined);

      await tx.teams.addMember(team.id, user.id, actor.id, now);
      await tx.audit.record(
        auditAction(actor, teamTarget('team.member-added', team.id), {
          userId: { before: null, after: user.id },
        }),
      );
      return ok(undefined);
    });
  }
}
