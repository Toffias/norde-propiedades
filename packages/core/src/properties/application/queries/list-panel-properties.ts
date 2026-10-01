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
  ListPanelPropertiesQuerySchema,
  type ListPanelPropertiesQuery,
  type PanelPropertyRow,
} from '../../contracts';
import { resolvePanelFilter, toPanelRows, type NoBranchAssignedError } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';
import type { UserNames } from '../ports/user-names';

export type ListPanelPropertiesError =
  | ForbiddenError
  | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] }
  | NoBranchAssignedError;

/**
 * Buscador de propiedades del panel. A diferencia de la búsqueda pública ve borradores y datos
 * internos. La cartera es de toda la inmobiliaria: con `properties:read` se ven todas, y "mis
 * captaciones" o "mi sucursal" son filtros. La papelera la ve quien puede borrar.
 */
export class ListPanelProperties {
  constructor(
    private readonly deps: {
      readonly properties: PanelPropertyListQuery;
      readonly users: UserNames;
    },
  ) {}

  async execute(
    input: ListPanelPropertiesQuery,
    actor: Actor,
  ): Promise<Result<Page<PanelPropertyRow>, ListPanelPropertiesError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = ListPanelPropertiesQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const query = parsed.data;
    const criteria = resolvePanelFilter(query, actor);
    if (criteria.isErr()) return err(criteria.error);

    const { page, pageSize } = query;
    const slice = await this.deps.properties.search({
      ...criteria.value,
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await toPanelRows(slice.items, this.deps.users);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
