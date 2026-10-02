import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateCloseReasonInputSchema, type UpdateCloseReasonInput } from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  closeReasonAuditState,
  configTarget,
  findCloseReason,
  type CloseReasonNotFoundError,
} from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UpdateCloseReasonError = ForbiddenError | InvalidInputError | CloseReasonNotFoundError;

/**
 * Renombra un motivo o cambia su calificación. Las oportunidades ya cerradas conservan su
 * resultado.
 */
export class UpdateCloseReason {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UpdateCloseReasonInput,
    actor: Actor,
  ): Promise<Result<void, UpdateCloseReasonError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = UpdateCloseReasonInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { reasonId, name, rating } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateCloseReasonError>> => {
      const reason = await findCloseReason(tx, reasonId);
      if (!reason) return err({ type: 'CloseReasonNotFound' });

      const before = closeReasonAuditState(reason);
      if (!reason.update({ name, rating }, now)) return ok(undefined);
      const entry = auditUpdated(
        actor,
        configTarget('opportunity_close_reason', 'opportunity_close_reason.updated', reason.id),
        before,
        closeReasonAuditState(reason),
      );
      await tx.closeReasons.save(reason, actor.id);
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
