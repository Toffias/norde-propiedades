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
  ListOwnedPropertiesQuerySchema,
  type ListOwnedPropertiesQuery,
  type PanelPropertyRow,
} from '../../contracts';
import { idsCriteria, toPanelRows } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { UserNames } from '../ports/user-names';

export type ListOwnedPropertiesError =
  ForbiddenError | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] };

/**
 * Las propiedades de la cartera de las que un contacto es propietario, para la pestaña de su
 * ficha. Paginadas en la base, como el buscador.
 */
export class ListOwnedProperties {
  constructor(
    private readonly deps: {
      readonly properties: PanelPropertyListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListOwnedPropertiesQuery,
    actor: Actor,
  ): Promise<Result<Page<PanelPropertyRow>, ListOwnedPropertiesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = ListOwnedPropertiesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { page, pageSize, sort, clientId } = parsed.data;
    const slice = await this.deps.properties.search({
      ...idsCriteria(undefined),
      ownerClientId: clientId.toLowerCase(),
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toPanelRows(slice.items, this.deps.users);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
