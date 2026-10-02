import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  OpportunityFilterSchema,
  type OpportunityFilter,
  type OpportunityStageCount,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import { canReadOpportunities, resolveOpportunityFilter } from '../opportunity-support';
import type { OpportunityPipelineQuery } from '../ports/opportunity-pipeline-query';

export type CountOpportunitiesByStageError = ForbiddenError | InvalidInputError;

/** Los contadores del pipeline: cuántas oportunidades visibles hay en cada estado con los filtros. */
export class CountOpportunitiesByStage {
  constructor(private readonly deps: { readonly pipeline: OpportunityPipelineQuery }) {}

  async execute(
    input: OpportunityFilter,
    actor: Actor,
  ): Promise<Result<OpportunityStageCount[], CountOpportunitiesByStageError>> {
    if (!canReadOpportunities(actor)) return err({ type: 'Forbidden' });

    const parsed = OpportunityFilterSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    return ok(await this.deps.pipeline.countByStage(resolveOpportunityFilter(parsed.data, actor)));
  }
}
