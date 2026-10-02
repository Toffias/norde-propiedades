import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  GetPropertySummariesInputSchema,
  MAX_PROPERTY_SUMMARIES,
  type GetPropertySummariesInput,
  type PanelPropertyRow,
} from '../../contracts';
import { idsCriteria, toPanelRows } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { UserNames } from '../ports/user-names';

export type GetPropertySummariesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Las filas del buscador de estas propiedades (las de una página de otro módulo: las destacadas
 * de un contacto). Solo las que están en la cartera; las borradas no vuelven.
 */
export class GetPropertySummaries {
  constructor(
    private readonly deps: {
      readonly properties: PanelPropertyListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: GetPropertySummariesInput,
    actor: Actor,
  ): Promise<Result<readonly PanelPropertyRow[], GetPropertySummariesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = GetPropertySummariesInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const ids = [...new Set(parsed.data.ids.map((id) => id.toLowerCase()))];
    if (ids.length === 0) return ok([]);
    const slice = await this.deps.properties.search({
      ...idsCriteria(ids),
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 0,
      limit: MAX_PROPERTY_SUMMARIES,
    });
    return ok(await toPanelRows(slice.items, this.deps.users));
  }
}
