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
  MarkOpportunityContactedInputSchema,
  type MarkOpportunityContactedInput,
} from '../../contracts';
import type { MoveToStageError } from '../../domain/opportunity';
import { firstActiveStageOf } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import type { OpportunityStageNotFoundError } from '../opportunity-config-support';
import {
  canUpdateOpportunity,
  findOpportunity,
  moveOpportunity,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type MarkOpportunityContactedError =
  | ForbiddenError
  | InvalidInputError
  | OpportunityNotFoundError
  | OpportunityStageNotFoundError
  | MoveToStageError;

/**
 * "Ya lo contacté" (Inicio): pasa la oportunidad al primer estado activo de la categoría
 * contactado. Es un cambio de estado como cualquier otro: historial, actividad y auditoría.
 */
export class MarkOpportunityContacted {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: MarkOpportunityContactedInput,
    actor: Actor,
  ): Promise<Result<void, MarkOpportunityContactedError>> {
    if (accessScope(actor, OWNERSHIP_RULES.opportunitiesUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = MarkOpportunityContactedInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, MarkOpportunityContactedError>> => {
      const opportunity = await findOpportunity(tx, parsed.data.opportunityId);
      if (!opportunity) return err({ type: 'OpportunityNotFound' });
      if (!canUpdateOpportunity(actor, opportunity.ownership)) return err({ type: 'Forbidden' });
      const stage = firstActiveStageOf(await tx.stages.findAll(), 'contacted');
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
