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
  SearchPublishedDevelopmentsInputSchema,
  type DevelopmentSummary,
  type SearchPublishedDevelopmentsInput,
} from '../../contracts';
import { PUBLICLY_LISTED_STATUSES } from '../../domain/property-status';
import { PUBLICLY_LISTED_DEVELOPMENT_STATUSES } from '../../domain/public-development';
import type { PublishedDevelopmentQuery } from '../ports/published-development-query';
import { toDevelopmentSummary } from '../published-development-mapper';

export type SearchPublishedDevelopmentsError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** Los emprendimientos que se están comercializando, para el listado de la web. */
export class SearchPublishedDevelopments {
  constructor(private readonly deps: { readonly developments: PublishedDevelopmentQuery }) {}

  async execute(
    input: SearchPublishedDevelopmentsInput,
    actor: Actor,
  ): Promise<Result<Page<DevelopmentSummary>, SearchPublishedDevelopmentsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = SearchPublishedDevelopmentsInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, ...filters } = parsed.data;

    const slice = await this.deps.developments.search({
      ...filters,
      statuses: PUBLICLY_LISTED_DEVELOPMENT_STATUSES,
      unitStatuses: PUBLICLY_LISTED_STATUSES,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(
      toPage(
        { items: slice.items.map(toDevelopmentSummary), total: slice.total },
        { page, pageSize },
      ),
    );
  }
}
