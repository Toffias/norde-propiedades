import {
  auditUpdated,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  RecordAppraisalResultInputSchema,
  type RecordAppraisalResultInput,
  type RecordAppraisalResultValues,
} from '../../contracts';
import type {
  AppraisalConvertedError,
  AppraisalDeletedError,
  AppraisalValueRequiredError,
} from '../../domain/appraisal';
import type {
  AppraisalResult,
  AppraisalValueRange,
  InvalidAppraisalResultError,
} from '../../domain/appraisal-result';
import {
  appraisalResultAuditState,
  appraisalTarget,
  invalidInput,
  loadAppraisalForChange,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalsUnitOfWork } from '../ports/appraisals-transaction';

export type RecordAppraisalResultError =
  | ForbiddenError
  | InvalidInputError
  | AppraisalNotFoundError
  | AppraisalDeletedError
  | AppraisalConvertedError
  | AppraisalValueRequiredError
  | InvalidAppraisalResultError;

function range(
  min: bigint | undefined,
  max: bigint | undefined,
  currency: AppraisalValueRange['currency'],
): AppraisalValueRange | undefined {
  return min === undefined || max === undefined
    ? undefined
    : { minCents: min, maxCents: max, currency };
}

function toResult(data: RecordAppraisalResultValues): AppraisalResult {
  return {
    sale: range(data.saleMin, data.saleMax, data.saleCurrency),
    rent: range(data.rentMin, data.rentMax, data.rentCurrency),
    comparables: data.comparables.map((comparable) => ({
      address: comparable.address,
      priceCents: comparable.price,
      currency: comparable.currency,
      surfaceM2: comparable.surfaceM2,
      url: comparable.url,
      note: comparable.note,
    })),
    observations: data.observations,
  };
}

/**
 * Carga o corrige el resultado de una tasación: valores sugeridos de venta y de alquiler (mínimo y
 * máximo), comparables y observaciones. Pide `appraisals:update` sobre una que el usuario ve. En el
 * historial quedan solo los campos que cambiaron.
 */
export class RecordAppraisalResult {
  constructor(
    private readonly deps: { readonly uow: AppraisalsUnitOfWork; readonly clock: Clock },
  ) {}

  async execute(
    input: RecordAppraisalResultInput,
    actor: Actor,
  ): Promise<Result<void, RecordAppraisalResultError>> {
    if (!actor.can('appraisals:update')) return err({ type: 'Forbidden' });
    const parsed = RecordAppraisalResultInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RecordAppraisalResultError>> => {
      const loaded = await loadAppraisalForChange(
        tx,
        actor,
        'appraisals:update',
        parsed.data.appraisalId,
      );
      if (loaded.isErr()) return err(loaded.error);
      const appraisal = loaded.value;

      const before = appraisalResultAuditState(appraisal);
      const changed = appraisal.recordResult(toResult(parsed.data), now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.appraisals.save(appraisal, actor.id);
      await tx.events.publish(appraisal.pullEvents());
      const entry = auditUpdated(
        actor,
        appraisalTarget('appraisal.result_recorded', appraisal),
        before,
        appraisalResultAuditState(appraisal),
      );
      if (entry) await tx.audit.record(entry);
      return ok(undefined);
    });
  }
}
