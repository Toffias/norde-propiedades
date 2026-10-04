import { OWNERSHIP_RULES } from '../../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  AppraisalIdInputSchema,
  type AppraisalDetail,
  type AppraisalIdInput,
} from '../../contracts';
import { withNames } from '../appraisal-rows';
import {
  canActOnAppraisal,
  invalidInput,
  type AppraisalNotFoundError,
  type InvalidInputError,
} from '../appraisal-support';
import type { AppraisalQuery } from '../ports/appraisal-query';
import type { PanelDirectory } from '../ports/panel-directory';

export type GetAppraisalError = ForbiddenError | InvalidInputError | AppraisalNotFoundError;

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

    const item = await this.deps.appraisals.findDetail(parsed.data.appraisalId);
    if (!item || !canActOnAppraisal(actor, OWNERSHIP_RULES.appraisalsRead, item)) {
      return err({ type: 'AppraisalNotFound' });
    }
    const [detail] = await withNames(this.deps.directory, [item]);
    if (!detail) return err({ type: 'AppraisalNotFound' });
    return ok(detail);
  }
}
