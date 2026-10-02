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
import { isStageUsedByRules } from '../../domain/opportunity-settings';
import type { LastActiveStageError, StageUsedByRuleError } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  configTarget,
  findStage,
  type OpportunityStageNotFoundError,
} from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type DeactivateOpportunityStageError =
  | ForbiddenError
  | InvalidInputError
  | OpportunityStageNotFoundError
  | LastActiveStageError
  | StageUsedByRuleError;

/**
 * Desactiva un estado: deja de ofrecerse, pero las oportunidades que lo tienen lo conservan. Un
 * estado no se borra (ADR 0013).
 */
export class DeactivateOpportunityStage {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: OpportunityStageIdInput,
    actor: Actor,
  ): Promise<Result<void, DeactivateOpportunityStageError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = OpportunityStageIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeactivateOpportunityStageError>> => {
      const stage = await findStage(tx, parsed.data.stageId);
      if (!stage) return err({ type: 'StageNotFound' });

      const stages = await tx.stages.findAll();
      const activeInCategory = stages.filter(
        (s) => s.isActive && s.category === stage.category,
      ).length;
      const usedByRule = isStageUsedByRules(await tx.opportunitySettings.get(), stage.id);
      const changed = stage.deactivate({ activeInCategory, usedByRule }, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.stages.save(stage, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          configTarget('opportunity_stage', 'opportunity_stage.deactivated', stage.id),
        ),
      );
      return ok(undefined);
    });
  }
}
