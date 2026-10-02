import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  ReorderOpportunityStagesInputSchema,
  type ReorderOpportunityStagesInput,
} from '../../contracts';
import { applyOrder, type InvalidOrderError } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import { configTarget, stageAuditState } from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ReorderOpportunityStagesError = ForbiddenError | InvalidInputError | InvalidOrderError;

/** Ordena los estados: es el orden de las secciones de la lista y de las columnas del tablero. */
export class ReorderOpportunityStages {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: ReorderOpportunityStagesInput,
    actor: Actor,
  ): Promise<Result<void, ReorderOpportunityStagesError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = ReorderOpportunityStagesInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReorderOpportunityStagesError>> => {
      const stages = await tx.stages.findAll();
      const before = new Map(stages.map((s) => [s.id, stageAuditState(s)]));
      const changed = applyOrder(stages, parsed.data.stageIds, now);
      if (changed.isErr()) return err(changed.error);

      for (const stage of changed.value) {
        await tx.stages.save(stage, actor.id);
        const entry = auditUpdated(
          actor,
          configTarget('opportunity_stage', 'opportunity_stage.reordered', stage.id),
          before.get(stage.id) ?? {},
          stageAuditState(stage),
        );
        if (entry) await tx.audit.record(entry);
      }
      return ok(undefined);
    });
  }
}
