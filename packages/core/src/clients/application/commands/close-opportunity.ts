import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  diffChanges,
  err,
  nextId,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import { CloseOpportunityInputSchema, type CloseOpportunityInput } from '../../contracts';
import type { CloseOpportunityError as DomainCloseError } from '../../domain/opportunity';
import { closingStatusFor } from '../../domain/opportunity-close-reason';
import { firstActiveStageOf } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  findCloseReason,
  findStage,
  type CloseReasonNotFoundError,
  type OpportunityStageNotFoundError,
} from '../opportunity-config-support';
import {
  canUpdateOpportunity,
  findOpportunity,
  opportunityAuditState,
  opportunityTarget,
  saveOpportunity,
  stagePositionOf,
  type OpportunityNotFoundError,
} from '../opportunity-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type CloseOpportunityError =
  | ForbiddenError
  | InvalidInputError
  | OpportunityNotFoundError
  | CloseReasonNotFoundError
  | OpportunityStageNotFoundError
  | DomainCloseError;

/**
 * Cierra una oportunidad con un motivo (mismos permisos que cambiar el estado). La calificación
 * del motivo decide si queda ganada o perdida; sin estado elegido, va al primero activo de esa
 * categoría.
 */
export class CloseOpportunity {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CloseOpportunityInput,
    actor: Actor,
  ): Promise<Result<void, CloseOpportunityError>> {
    if (accessScope(actor, OWNERSHIP_RULES.opportunitiesUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = CloseOpportunityInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { opportunityId, closeReasonId, stageId } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, CloseOpportunityError>> => {
      const opportunity = await findOpportunity(tx, opportunityId);
      if (!opportunity) return err({ type: 'OpportunityNotFound' });
      if (!canUpdateOpportunity(actor, opportunity.ownership)) return err({ type: 'Forbidden' });
      const reason = await findCloseReason(tx, closeReasonId);
      if (!reason) return err({ type: 'CloseReasonNotFound' });
      const stage =
        stageId === undefined
          ? firstActiveStageOf(await tx.stages.findAll(), closingStatusFor(reason.rating))
          : await findStage(tx, stageId);
      if (!stage) return err({ type: 'StageNotFound' });

      const before = opportunityAuditState(opportunity);
      const from = stagePositionOf(opportunity);
      const closed = opportunity.close(reason.ref(), stage.ref(), {
        id: nextId<'OpportunityStatusChange'>(this.deps.ids),
        now,
      });
      if (closed.isErr()) return err(closed.error);

      await saveOpportunity(tx, opportunity, actor, this.deps.ids, now, from);
      await tx.audit.record(
        auditAction(
          actor,
          opportunityTarget('opportunity.closed', opportunity),
          diffChanges(before, opportunityAuditState(opportunity)),
        ),
      );
      return ok(undefined);
    });
  }
}
