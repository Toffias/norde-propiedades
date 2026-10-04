import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UpdateAppraisalInputSchema, type UpdateAppraisalInput } from '../../contracts';
import type {
  AppraisalConvertedError,
  AppraisalDeletedError,
  InvalidAppraisalDetailsError,
  VisitDateRequiredError,
} from '../../domain/appraisal';
import {
  appraisalAuditState,
  appraisalTarget,
  buildDetails,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type AppraiserNotFoundError,
  type InvalidInputError,
  type ProducerNotFoundError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';
import type { ActiveUsers } from '../ports/panel-directory';

export type UpdateAppraisalError =
  | ForbiddenError
  | InvalidInputError
  | AppraisalNotFoundError
  | ProducerNotFoundError
  | AppraiserNotFoundError
  | AppraisalDeletedError
  | AppraisalConvertedError
  | VisitDateRequiredError
  | InvalidAppraisalDetailsError;

/**
 * Edita los datos de una tasación (solicitante, productor, tasador, visita y datos de la propiedad),
 * con `appraisals:update` sobre una que el usuario puede ver. En el historial quedan solo los
 * campos que cambiaron.
 */
export class UpdateAppraisal {
  constructor(
    private readonly deps: {
      readonly uow: AppraisalsUnitOfWork;
      readonly users: ActiveUsers;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: UpdateAppraisalInput,
    actor: Actor,
  ): Promise<Result<void, UpdateAppraisalError>> {
    if (!actor.can('appraisals:update')) return err({ type: 'Forbidden' });
    const parsed = UpdateAppraisalInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { appraisalId, ...data } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UpdateAppraisalError>> => {
      const loaded = await loadAppraisalForChange(tx, actor, 'appraisals:update', appraisalId);
      if (loaded.isErr()) return err(loaded.error);
      const appraisal = loaded.value;

      const details = await buildDetails(this.deps.users, actor, data, appraisal.toSnapshot());
      if (details.isErr()) return err(details.error);

      const before = appraisalAuditState(appraisal);
      const previousRequester = appraisal.requesterClientId;
      const changed = appraisal.update(details.value, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.appraisals.save(appraisal, actor.id);
      await tx.events.publish(appraisal.pullEvents());
      const entry = auditUpdated(
        actor,
        appraisalTarget('appraisal.updated', appraisal, previousRequester),
        before,
        appraisalAuditState(appraisal),
      );
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
