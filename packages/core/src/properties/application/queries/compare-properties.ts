import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  ComparePropertiesQuerySchema,
  MAX_COMPARE,
  type ComparePropertiesQuery,
  type PanelPropertyRow,
} from '../../contracts';
import { idsCriteria, toPanelRows } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { UserNames } from '../ports/user-names';

export type ComparePropertiesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/** De 2 a 4 propiedades lado a lado, en el orden en que se eligieron. */
export class CompareProperties {
  constructor(
    private readonly deps: {
      readonly properties: PanelPropertyListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ComparePropertiesQuery,
    actor: Actor,
  ): Promise<Result<readonly PanelPropertyRow[], ComparePropertiesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = ComparePropertiesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const ids = [...new Set(parsed.data.ids.map((id) => id.toLowerCase()))];
    const slice = await this.deps.properties.search({
      ...idsCriteria(ids),
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 0,
      limit: MAX_COMPARE,
    });
    const rows = await toPanelRows(slice.items, this.deps.users);
    const order = new Map(ids.map((id, index) => [id, index]));
    return ok([...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
  }
}
