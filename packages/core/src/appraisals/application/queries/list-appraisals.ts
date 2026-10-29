import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListAppraisalsQuerySchema,
  type AppraisalListRow,
  type ListAppraisalsQuery,
} from '../../contracts';
import { appraisalCriteria } from '../appraisal-filter';
import { withNames } from '../appraisal-rows';
import { invalidInput, type InvalidInputError } from '../appraisal-support';
import type { AppraisalQuery } from '../ports/appraisal-query';
import type { PanelDirectory } from '../ports/panel-directory';

export type ListAppraisalsError = ForbiddenError | InvalidInputError;

/**
 * Las tasaciones (`/tasaciones`), con filtros, paginadas en la base. Sin "Ver tasaciones de
 * otros", solo las que el usuario produce o tasa. La papelera pide además `appraisals:delete`.
 */
export class ListAppraisals {
  constructor(
    private readonly deps: {
      readonly appraisals: AppraisalQuery;
      readonly directory: PanelDirectory;
    },
  ) {}

  async execute(
    input: ListAppraisalsQuery,
    actor: Actor,
  ): Promise<Result<Page<AppraisalListRow>, ListAppraisalsError>> {
    if (!actor.can('appraisals:read')) return err({ type: 'Forbidden' });
    const parsed = ListAppraisalsQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, ...filter } = parsed.data;
    if (filter.view === 'trash' && !actor.can('appraisals:delete')) {
      return err({ type: 'Forbidden' });
    }

    const slice = await this.deps.appraisals.search({
      ...appraisalCriteria(filter, actor),
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await withNames(this.deps.directory, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
