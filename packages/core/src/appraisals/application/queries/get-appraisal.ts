import { OWNERSHIP_RULES } from '../../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  AppraisalIdInputSchema,
  MANUAL_APPRAISAL_STATUS_VALUES,
  type AppraisalDetail,
  type AppraisalIdInput,
} from '../../contracts';
import { checkAppraisalReportable } from '../../domain/appraisal-report';
import { comparablePricePerM2Cents } from '../../domain/appraisal-result';
import { canAppraisalTransition } from '../../domain/appraisal-status';
import { withNames } from '../appraisal-rows';
import {
  canActOnAppraisal,
  invalidInput,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalDetailItem, AppraisalQuery } from '../ports/appraisal-query';
import type { PanelDirectory } from '../ports/panel-directory';

export type GetAppraisalError = ForbiddenError | InvalidInputError | AppraisalNotFoundError;

/**
 * La ficha de una tasación que el usuario puede ver (también si está en la papelera), con lo que
 * decide el dominio. Una que no puede ver es, para él, una que no existe.
 */
export async function readAppraisalDetail(
  deps: { readonly appraisals: AppraisalQuery; readonly directory: PanelDirectory },
  appraisalId: string,
  actor: Actor,
): Promise<AppraisalDetail | undefined> {
  const item = await deps.appraisals.findDetail(appraisalId);
  if (!item || !canActOnAppraisal(actor, OWNERSHIP_RULES.appraisalsRead, item)) return undefined;
  const [detail] = await withNames(deps.directory, [item]);
  if (!detail) return undefined;
  const nextStatuses = MANUAL_APPRAISAL_STATUS_VALUES.filter((status) =>
    canAppraisalTransition(item.status, status),
  );
  return {
    ...detail,
    result: { ...item.result, comparables: comparableRows(item.result.comparables) },
    nextStatuses,
    convertible: canAppraisalTransition(item.status, 'converted') && item.deletedAt === undefined,
    reportable: checkAppraisalReportable(item).isOk(),
  };
}

function comparableRows(comparables: AppraisalDetailItem['result']['comparables']) {
  return comparables.map((comparable) => {
    const perM2 = comparablePricePerM2Cents({
      address: comparable.address,
      priceCents: comparable.price.amountCents,
      currency: comparable.price.currency,
      surfaceM2: comparable.surfaceM2,
      url: comparable.url,
      note: comparable.note,
    });
    const pricePerM2 =
      perM2 === undefined ? undefined : { amountCents: perM2, currency: comparable.price.currency };
    return { ...comparable, pricePerM2 };
  });
}

/**
 * La ficha de una tasación (también si está en la papelera). Una que el usuario no puede ver es,
 * para él, una que no existe.
 */
export class GetAppraisal {
  constructor(
    private readonly deps: {
      readonly appraisals: AppraisalQuery;
      readonly directory: PanelDirectory;
    },
  ) {}

  async execute(
    input: AppraisalIdInput,
    actor: Actor,
  ): Promise<Result<AppraisalDetail, GetAppraisalError>> {
    if (!actor.can('appraisals:read')) return err({ type: 'Forbidden' });
    const parsed = AppraisalIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const detail = await readAppraisalDetail(this.deps, parsed.data.appraisalId, actor);
    return detail ? ok(detail) : err({ type: 'AppraisalNotFound' });
  }
}
