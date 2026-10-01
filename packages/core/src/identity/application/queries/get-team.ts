import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { TeamIdInputSchema, type TeamDetail, type TeamIdInput } from '../../contracts';
import type { OrganizationQuery } from '../ports/organization-query';
import type { InvalidInputError, TeamNotFoundError } from '../user-audit';

export type GetTeamError = ForbiddenError | InvalidInputError | TeamNotFoundError;

/** Un equipo (sus miembros se listan paginados con `ListUsers` y `teamId`). */
export class GetTeam {
  constructor(private readonly deps: { readonly organization: OrganizationQuery }) {}

  async execute(input: TeamIdInput, actor: Actor): Promise<Result<TeamDetail, GetTeamError>> {
    if (!actor.can('teams:read')) return err({ type: 'Forbidden' });

    const parsed = TeamIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const team = await this.deps.organization.findTeam(parsed.data.teamId);
    return team ? ok(team) : err({ type: 'TeamNotFound' });
  }
}
