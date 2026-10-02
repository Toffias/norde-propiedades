import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ReassignOpportunityInputSchema, type ReassignOpportunityInput } from '../../contracts';
import type { OpportunityClosedError } from '../../domain/opportunity';
import {
  invalidInput,
  resolveAgent,
  type AgentNotFoundError,
  type InvalidInputError,
} from '../client-support';
import {
  canReassignOpportunity,
  findOpportunity,
  opportunityAuditState,
  opportunityTarget,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ReassignOpportunityError =
  | ForbiddenError
  | InvalidInputError
  | OpportunityNotFoundError
  | OpportunityClosedError
  | AgentNotFoundError;

/**
 * Cambia el agente de una oportunidad abierta (`opportunities:reassign`, sobre una que el actor
 * puede ver), sin tocar el del contacto. La oportunidad pasa a la sucursal del agente nuevo.
 */
export class ReassignOpportunity {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ReassignOpportunityInput,
    actor: Actor,
  ): Promise<Result<void, ReassignOpportunityError>> {
    if (!actor.can('opportunities:reassign')) return err({ type: 'Forbidden' });

    const parsed = ReassignOpportunityInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const agent = await resolveAgent(this.deps.agents, parsed.data.agentId ?? undefined);
    if (agent.isErr()) return err(agent.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReassignOpportunityError>> => {
      const opportunity = await findOpportunity(tx, parsed.data.opportunityId);
      if (!opportunity) return err({ type: 'OpportunityNotFound' });
      if (!canReassignOpportunity(actor, opportunity.ownership)) {
        return err({ type: 'Forbidden' });
      }
      const before = opportunityAuditState(opportunity);
      const changed = opportunity.assignAgent(agent.value, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.opportunities.save(opportunity, actor.id);
      await tx.events.publish(opportunity.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          opportunityTarget('opportunity.reassigned', opportunity),
          diffChanges(before, opportunityAuditState(opportunity)),
        ),
      );
      return ok(undefined);
    });
  }
}
