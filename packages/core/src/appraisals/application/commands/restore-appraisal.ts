import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { AppraisalIdInputSchema, type AppraisalIdInput } from '../../contracts';
import type { AppraisalNotDeletedError } from '../../domain/appraisal';
import {
  appraisalTarget,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type RestoreAppraisalError =
  ForbiddenError | InvalidInputError | AppraisalNotFoundError | AppraisalNotDeletedError;

/** Saca una tasación de la papelera, con `appraisals:delete` (el mismo que la borra). */
export class RestoreAppraisal {
  constructor(
    private readonly deps: { readonly uow: AppraisalsUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: AppraisalIdInput,
    actor: Actor,
  ): Promise<Result<void, RestoreAppraisalError>> {
    if (!actor.can('appraisals:delete')) return err({ type: 'Forbidden' });
    const parsed = AppraisalIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RestoreAppraisalError>> => {
      const loaded = await loadAppraisalForChange(
        tx,
        actor,
        'appraisals:delete',
        parsed.data.appraisalId,
      );
      if (loaded.isErr()) return err(loaded.error);
      const appraisal = loaded.value;

      const restored = appraisal.restoreFromTrash(now);
      if (restored.isErr()) return err(restored.error);

      await tx.appraisals.save(appraisal, actor.id);
      await tx.events.publish(appraisal.pullEvents());
      await tx.audit.record(auditAction(actor, appraisalTarget('appraisal.restored', appraisal)));
      return ok(undefined);
    });
  }
}
