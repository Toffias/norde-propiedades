import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ChangeAppraisalStatusInputSchema, type ChangeAppraisalStatusInput } from '../../contracts';
import type {
  AppraisalConvertedError,
  AppraisalDeletedError,
  AppraisalValueRequiredError,
  InvalidAppraisalTransitionError,
  VisitDateRequiredError,
} from '../../domain/appraisal';
import {
  appraisalTarget,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type ChangeAppraisalStatusError =
  | ForbiddenError
  | InvalidInputError
  | AppraisalNotFoundError
  | AppraisalDeletedError
  | AppraisalConvertedError
  | InvalidAppraisalTransitionError
  | VisitDateRequiredError
  | AppraisalValueRequiredError;

/**
 * Pasa una tasación a otro estado (agendar la visita, marcarla tasada, descartarla o reabrirla),
 * con `appraisals:update`. "Convertida" no se elige a mano: la marca la conversión en propiedad.
 */
export class ChangeAppraisalStatus {
  constructor(
    private readonly deps: { readonly uow: AppraisalsUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: ChangeAppraisalStatusInput,
    actor: Actor,
  ): Promise<Result<void, ChangeAppraisalStatusError>> {
    if (!actor.can('appraisals:update')) return err({ type: 'Forbidden' });
    const parsed = ChangeAppraisalStatusInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { appraisalId, status } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ChangeAppraisalStatusError>> => {
      const loaded = await loadAppraisalForChange(tx, actor, 'appraisals:update', appraisalId);
      if (loaded.isErr()) return err(loaded.error);
      const appraisal = loaded.value;

      const before = appraisal.status;
      const changed = appraisal.changeStatus(status, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.appraisals.save(appraisal, actor.id);
      await tx.events.publish(appraisal.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          appraisalTarget('appraisal.status_changed', appraisal),
          diffChanges({ status: before }, { status: appraisal.status }),
        ),
      );
      return ok(undefined);
    });
  }
}
