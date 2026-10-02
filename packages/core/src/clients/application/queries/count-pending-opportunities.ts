import { ok, type Actor, type Result } from '../../../shared';
import { canReadOpportunities } from '../opportunity-support';
import type { OpportunityPipelineQuery } from '../ports/opportunity-pipeline-query';

/** Pendientes de atender: las nuevas. */
const PENDING_CATEGORIES = ['new'] as const;

/**
 * El contador del menú: cuántas oportunidades nuevas tiene asignadas el actor. Sin permiso para ver
 * oportunidades, o si es un actor de sistema, cero.
 */
export class CountPendingOpportunities {
  constructor(private readonly deps: { readonly pipeline: OpportunityPipelineQuery }) {}

  async execute(actor: Actor): Promise<Result<number, never>> {
    if (actor.kind !== 'user' || !canReadOpportunities(actor)) return ok(0);
    return ok(await this.deps.pipeline.countAssigned(actor.id, PENDING_CATEGORIES));
  }
}
