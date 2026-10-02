import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ReorderCloseReasonsInputSchema, type ReorderCloseReasonsInput } from '../../contracts';
import { applyOrder, type InvalidOrderError } from '../../domain/opportunity-stage';
import { invalidInput, type InvalidInputError } from '../client-support';
import { closeReasonAuditState, configTarget } from '../opportunity-config-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ReorderCloseReasonsError = ForbiddenError | InvalidInputError | InvalidOrderError;

/** Ordena los motivos de cierre: es el orden en que se ofrecen al cerrar. */
export class ReorderCloseReasons {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: ReorderCloseReasonsInput,
    actor: Actor,
  ): Promise<Result<void, ReorderCloseReasonsError>> {
    if (!actor.can('settings:update')) return err({ type: 'Forbidden' });

    const parsed = ReorderCloseReasonsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReorderCloseReasonsError>> => {
      const reasons = await tx.closeReasons.findAll();
      const before = new Map(reasons.map((r) => [r.id, closeReasonAuditState(r)]));
      const changed = applyOrder(reasons, parsed.data.reasonIds, now);
      if (changed.isErr()) return err(changed.error);

      for (const reason of changed.value) {
        await tx.closeReasons.save(reason, actor.id);
        const entry = auditUpdated(
          actor,
          configTarget('opportunity_close_reason', 'opportunity_close_reason.reordered', reason.id),
          before.get(reason.id) ?? {},
          closeReasonAuditState(reason),
        );
        if (entry) await tx.audit.record(entry);
      }
      return ok(undefined);
    });
  }
}
