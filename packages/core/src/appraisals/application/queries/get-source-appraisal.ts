import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  SourceAppraisalQuerySchema,
  type SourceAppraisal,
  type SourceAppraisalQuery,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../appraisal-support';
import type { AppraisalQuery } from '../ports/appraisal-query';
import type { PanelDirectory } from '../ports/panel-directory';
import { readAppraisalDetail } from './get-appraisal';

export type GetSourceAppraisalError = ForbiddenError | InvalidInputError;

/**
 * La tasación de origen de una propiedad: la que se convirtió en ella (`ConvertAppraisalToListing`),
 * para la ficha de la propiedad. `undefined` si la propiedad no salió de una tasación o si el
 * usuario no puede ver esa tasación (para él, no tiene).
 */
export class GetSourceAppraisal {
  constructor(
    private readonly deps: {
      readonly appraisals: AppraisalQuery;
      readonly directory: PanelDirectory;
    },
  ) {}

  async execute(
    input: SourceAppraisalQuery,
    actor: Actor,
  ): Promise<Result<SourceAppraisal | undefined, GetSourceAppraisalError>> {
    if (!actor.can('appraisals:read')) return err({ type: 'Forbidden' });
    const parsed = SourceAppraisalQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const appraisalId = await this.deps.appraisals.findIdByConvertedProperty(
      parsed.data.propertyId,
    );
    if (appraisalId === undefined) return ok(undefined);
    const detail = await readAppraisalDetail(this.deps, appraisalId, actor);
    if (detail === undefined) return ok(undefined);
    return ok({
      id: detail.id,
      code: detail.code,
      status: detail.status,
      appraiser: detail.appraiser,
      createdAt: detail.createdAt,
      sale: detail.result.sale,
      rent: detail.result.rent,
      deletedAt: detail.deletedAt,
    });
  }
}
