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
  UpdateOpportunityStageInputSchema,
  type UpdateOpportunityStageInput,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  configTarget,
  findStage,
  stageAuditState,
  type OpportunityStageNotFoundError,
} from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UpdateOpportunityStageError =
  ForbiddenError | InvalidInputError | OpportunityStageNotFoundError;

/** Renombra o recolorea un estado. Las oportunidades que lo tienen lo muestran con el cambio. */
export class UpdateOpportunityStage {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateOpportunityStageInput,
    actor: Actor,
  ): Promise<Result<void, UpdateOpportunityStageError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateOpportunityStageInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { stageId, name, color } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateOpportunityStageError>> => {
      const stage = await findStage(tx, stageId);
      if (!stage) return err({ type: 'StageNotFound' });

      const before = stageAuditState(stage);
      if (!stage.update({ name, color }, now)) return ok(undefined);
      const entry = auditUpdated(
        actor,
        configTarget('opportunity_stage', 'opportunity_stage.updated', stage.id),
        before,
        stageAuditState(stage),
      );
      await tx.stages.save(stage, actor.id);
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
