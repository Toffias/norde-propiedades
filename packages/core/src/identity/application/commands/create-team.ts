import {
  auditCreated,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CreateTeamInputSchema, type CreateTeamInput } from '../../contracts';
import { Team } from '../../domain/team';
import { teamAuditState, teamTarget } from '../organization-support';
import type { IdentityUnitOfWork } from '../ports/identity-transaction';
import type { BranchNotFoundError, InvalidInputError, NameTakenError } from '../user-audit';

export type CreateTeamError =
  ForbiddenError | InvalidInputError | BranchNotFoundError | NameTakenError;

/** Equipo nuevo, sin miembros. */
export class CreateTeam {
  constructor(
    private readonly deps: {
      readonly uow: IdentityUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateTeamInput,
    actor: Actor,
  ): Promise<Result<{ readonly teamId: string }, CreateTeamError>> {
    if (!actor.can('teams:create')) return err({ type: 'Forbidden' });

    const parsed = CreateTeamInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { name, branchId } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly teamId: string }, CreateTeamError>> => {
        if (
          branchId !== undefined &&
          (await tx.branches.findExistingIds([branchId])).length === 0
        ) {
          return err({ type: 'BranchNotFound' });
        }
        if (await tx.teams.findActiveByName(name)) return err({ type: 'NameTaken' });

        const team = Team.create({ id: nextId<'Team'>(this.deps.ids), name, branchId, now });
        await tx.teams.save(team, actor.id);
        await tx.events.publish(team.pullEvents());
        await tx.audit.record(
          auditCreated(actor, teamTarget('team.created', team.id), teamAuditState(team)),
        );
        return ok({ teamId: team.id });
      },
    );
  }
}
