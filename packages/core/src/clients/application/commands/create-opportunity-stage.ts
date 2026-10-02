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
import {
  CreateOpportunityStageInputSchema,
  type CreateOpportunityStageInput,
} from '../../contracts';
import { OpportunityStage, type TooManyStagesError } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import { configTarget, stageAuditState } from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type CreateOpportunityStageError = ForbiddenError | InvalidInputError | TooManyStagesError;

/** Agrega un estado de oportunidad al final del tablero, dentro de una categoría fija. */
export class CreateOpportunityStage {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateOpportunityStageInput,
    actor: Actor,
  ): Promise<Result<{ readonly stageId: string }, CreateOpportunityStageError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = CreateOpportunityStageInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly stageId: string }, CreateOpportunityStageError>> => {
        const created = OpportunityStage.create({
          id: nextId<'OpportunityStage'>(this.deps.ids),
          ...parsed.data,
          existingCount: (await tx.stages.findAll()).length,
          now,
        });
        if (created.isErr()) return err(created.error);
        const stage = created.value;

        await tx.stages.save(stage, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            configTarget('opportunity_stage', 'opportunity_stage.created', stage.id),
            stageAuditState(stage),
          ),
        );
        return ok({ stageId: stage.id });
      },
    );
  }
}
