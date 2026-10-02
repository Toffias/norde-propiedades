import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import {
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  ChangeOpportunityStageInputSchema,
  type ChangeOpportunityStageInput,
} from '../../contracts';
import type { MoveToStageError } from '../../domain/opportunity';
import { invalidInput, type InvalidInputError } from '../client-support';
import { findStage, type OpportunityStageNotFoundError } from '../opportunity-config-support';
import {
  canUpdateOpportunity,
  findOpportunity,
  moveOpportunity,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ChangeOpportunityStageError =
  | ForbiddenError
  | InvalidInputError
  | OpportunityNotFoundError
  | OpportunityStageNotFoundError
  | MoveToStageError;

/**
 * Pasa una oportunidad abierta a otro estado (`opportunities:update` sobre la suya, o
 * `opportunities:update-others`). Entre categorías valida el dominio; a ganada o perdida se llega
 * cerrando. Queda en el historial de estados, en la actividad del cliente y en la auditoría.
 */
export class ChangeOpportunityStage {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ChangeOpportunityStageInput,
    actor: Actor,
  ): Promise<Result<void, ChangeOpportunityStageError>> {
    if (accessScope(actor, OWNERSHIP_RULES.opportunitiesUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = ChangeOpportunityStageInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ChangeOpportunityStageError>> => {
      const opportunity = await findOpportunity(tx, parsed.data.opportunityId);
      if (!opportunity) return err({ type: 'OpportunityNotFound' });
      if (!canUpdateOpportunity(actor, opportunity.ownership)) return err({ type: 'Forbidden' });
      const stage = await findStage(tx, parsed.data.stageId);
      if (!stage) return err({ type: 'StageNotFound' });

      const moved = await moveOpportunity(tx, opportunity, stage.ref(), actor, {
        ids: this.deps.ids,
        now,
      });
      if (moved.isErr()) return err(moved.error);
      return ok(undefined);
    });
  }
}
