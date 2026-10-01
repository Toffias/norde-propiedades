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
import { OWNERSHIP_RULES } from '../../../identity';
import {
  ListPanelPropertiesQuerySchema,
  type ListPanelPropertiesQuery,
  type PanelPropertyRow,
} from '../../contracts';
import type {
  PanelPropertyListQuery,
  PropertyOwnerFilter,
} from '../ports/panel-property-list-query';
import type { UserNames } from '../ports/user-names';

export type ListPanelPropertiesError =
  | ForbiddenError
  | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] }
  /** Pidió "mi sucursal" sin tener una asignada. */
  | { readonly type: 'NoBranchAssigned' };

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
    const deleteRule = OWNERSHIP_RULES.propertiesDelete;
    if (query.view === 'trash' && !actor.can(deleteRule.own) && !actor.can(deleteRule.all)) {
      return err({ type: 'Forbidden' });
    }

    let owner: PropertyOwnerFilter;
    switch (query.scope) {
      case 'all':
        owner = { kind: 'all' };
        break;
      case 'mine':
        owner = { kind: 'producer', userId: actor.id };
        break;
      case 'branch':
        if (actor.branchId === undefined) return err({ type: 'NoBranchAssigned' });
        owner = { kind: 'branch', branchId: actor.branchId };
        break;
    }

    const { page, pageSize } = query;
    const slice = await this.deps.properties.search({
      view: query.view,
      owner,
      text: query.q,
      operation: query.operation,
      propertyType: query.propertyType,
      status: query.status,
      location: query.location,
      price:
        query.currency === undefined
          ? undefined
          : { currency: query.currency, minCents: query.minPrice, maxCents: query.maxPrice },
      sort: query.sort,
      ...toOffsetLimit({ page, pageSize }),
    });

    const userIds = new Set<string>();
    for (const item of slice.items) {
      if (item.producerUserId !== undefined) userIds.add(item.producerUserId);
      if (item.deletedBy !== undefined) userIds.add(item.deletedBy);
    }
    const names = await this.deps.users.names([...userIds]);
    const ref = (id: string | undefined) =>
      id === undefined ? undefined : { id, name: names.get(id) };

    const items: PanelPropertyRow[] = slice.items.map(({ producerUserId, deletedBy, ...item }) => ({
      ...item,
      producer: ref(producerUserId),
      deletedBy: ref(deletedBy),
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
