import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { OpportunityStageIdInputSchema, type OpportunityStageIdInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  configTarget,
  findStage,
  type OpportunityStageNotFoundError,
} from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ReactivateOpportunityStageError =
  ForbiddenError | InvalidInputError | OpportunityStageNotFoundError;

/** Vuelve a ofrecer un estado desactivado. */
export class ReactivateOpportunityStage {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: OpportunityStageIdInput,
    actor: Actor,
  ): Promise<Result<void, ReactivateOpportunityStageError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = OpportunityStageIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReactivateOpportunityStageError>> => {
      const stage = await findStage(tx, parsed.data.stageId);
      if (!stage) return err({ type: 'StageNotFound' });
      if (!stage.reactivate(now)) return ok(undefined);

      await tx.stages.save(stage, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          configTarget('opportunity_stage', 'opportunity_stage.reactivated', stage.id),
        ),
      );
      return ok(undefined);
    });
  }
}
