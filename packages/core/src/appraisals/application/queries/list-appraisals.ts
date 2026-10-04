import { OWNERSHIP_RULES, visibilityFilter } from '../../../identity';
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
import { statusesOfGroup } from '../../domain/appraisal-status';
import { withNames } from '../appraisal-rows';
import { invalidInput, type InvalidInputError } from '../appraisal-support';
import type { AppraisalQuery } from '../ports/appraisal-query';
import type { PanelDirectory } from '../ports/panel-directory';

export type ListAppraisalsError = ForbiddenError | InvalidInputError;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/** `[desde, hasta)` en instantes UTC, con "hasta" inclusive. */
function dayRange(from: string | undefined, to: string | undefined) {
  return {
    from: from === undefined ? undefined : startOfDay(from),
    to: to === undefined ? undefined : new Date(startOfDay(to).getTime() + DAY_MS),
  };
}

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
      visibility: visibilityFilter(actor, OWNERSHIP_RULES.appraisalsRead),
      deleted: filter.view === 'trash',
      statuses: filter.status === undefined ? undefined : statusesOfGroup(filter.status),
      propertyType: filter.propertyType,
      producerUserId: filter.producerId,
      appraiserUserId: filter.appraiserId,
      branchId: filter.branchId,
      created: dayRange(filter.createdFrom, filter.createdTo),
      visit: dayRange(filter.visitFrom, filter.visitTo),
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await withNames(this.deps.directory, slice.items);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
