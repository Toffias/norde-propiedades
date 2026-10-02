import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { CloseReasonIdInputSchema, type CloseReasonIdInput } from '../../contracts';
import type { LastActiveCloseReasonError } from '../../domain/opportunity-close-reason';
import { invalidInput, type InvalidInputError } from '../client-support';
import {
  configTarget,
  findCloseReason,
  type CloseReasonNotFoundError,
} from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type DeactivateCloseReasonError =
  ForbiddenError | InvalidInputError | CloseReasonNotFoundError | LastActiveCloseReasonError;

/** Deja de ofrecer un motivo al cerrar. Las oportunidades cerradas con él lo conservan. */
export class DeactivateCloseReason {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: CloseReasonIdInput,
    actor: Actor,
  ): Promise<Result<void, DeactivateCloseReasonError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = CloseReasonIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeactivateCloseReasonError>> => {
      const reason = await findCloseReason(tx, parsed.data.reasonId);
      if (!reason) return err({ type: 'CloseReasonNotFound' });

      const activeCount = (await tx.closeReasons.findAll()).filter((r) => r.isActive).length;
      const changed = reason.deactivate(activeCount, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.closeReasons.save(reason, actor.id);
      await tx.audit.record(
        auditAction(
          actor,
          configTarget(
            'opportunity_close_reason',
            'opportunity_close_reason.deactivated',
            reason.id,
          ),
        ),
      );
      return ok(undefined);
    });
  }
}
