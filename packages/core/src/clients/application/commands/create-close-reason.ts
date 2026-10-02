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
import { CreateCloseReasonInputSchema, type CreateCloseReasonInput } from '../../contracts';
import {
  OpportunityCloseReason,
  type TooManyCloseReasonsError,
} from '../../domain/opportunity-close-reason';
import { invalidInput, type InvalidInputError } from '../client-support';
import { closeReasonAuditState, configTarget } from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type CreateCloseReasonError = ForbiddenError | InvalidInputError | TooManyCloseReasonsError;

/** Agrega un motivo de cierre al final de la lista. */
export class CreateCloseReason {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: CreateCloseReasonInput,
    actor: Actor,
  ): Promise<Result<{ readonly reasonId: string }, CreateCloseReasonError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = CreateCloseReasonInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly reasonId: string }, CreateCloseReasonError>> => {
        const created = OpportunityCloseReason.create({
          id: nextId<'OpportunityCloseReason'>(this.deps.ids),
          ...parsed.data,
          existingCount: (await tx.closeReasons.findAll()).length,
          now,
        });
        if (created.isErr()) return err(created.error);
        const reason = created.value;

        await tx.closeReasons.save(reason, actor.id);
        await tx.audit.record(
          auditCreated(
            actor,
            configTarget('opportunity_close_reason', 'opportunity_close_reason.created', reason.id),
            closeReasonAuditState(reason),
          ),
        );
        return ok({ reasonId: reason.id });
      },
    );
  }
}
