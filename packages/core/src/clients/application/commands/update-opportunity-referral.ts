import { accessScope, OWNERSHIP_RULES } from '../../../identity';
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
import {
  UpdateOpportunityReferralInputSchema,
  type UpdateOpportunityReferralInput,
} from '../../contracts';
import type { OpportunityNotReferredError } from '../../domain/opportunity';
import { dayRange, invalidInput, type InvalidInputError } from '../client-support';
import {
  canUpdateOpportunity,
  findOpportunity,
  opportunityAuditState,
  opportunityTarget,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UpdateOpportunityReferralError =
  ForbiddenError | InvalidInputError | OpportunityNotFoundError | OpportunityNotReferredError;

/**
 * Los datos de la derivación de una oportunidad en "Aplica a otra inmobiliaria": a qué socia se
 * derivó, cuándo y cómo terminó (derivada, sin opciones, volvió a Norde). Lo carga quien puede
 * cambiar la oportunidad; queda en su auditoría.
 */
export class UpdateOpportunityReferral {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateOpportunityReferralInput,
    actor: Actor,
  ): Promise<Result<void, UpdateOpportunityReferralError>> {
    if (accessScope(actor, OWNERSHIP_RULES.opportunitiesUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = UpdateOpportunityReferralInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { opportunityId, partnerName, referredAt, result } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateOpportunityReferralError>> => {
      const opportunity = await findOpportunity(tx, opportunityId);
      if (!opportunity) return err({ type: 'OpportunityNotFound' });
      if (!canUpdateOpportunity(actor, opportunity.ownership)) {
        return err({ type: 'Forbidden' });
      }

      const before = opportunityAuditState(opportunity);
      const changed = opportunity.updateReferral(
        {
          partnerName: partnerName ?? undefined,
          // El día de Buenos Aires, a su medianoche.
          referredAt: referredAt === null ? undefined : dayRange(referredAt, undefined).from,
          result: result ?? undefined,
        },
        now,
      );
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.opportunities.save(opportunity, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          opportunityTarget('opportunity.referral_updated', opportunity),
          diffChanges(before, opportunityAuditState(opportunity)),
        ),
      );
      return ok(undefined);
    });
  }
}
