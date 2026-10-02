import { err, ok, type Actor, type ForbiddenError, type Result } from '../../shared';
import { OWNERSHIP_RULES } from '../../identity';
import type {
  Currency,
  Operation,
  PanelPropertyRow,
  PropertyScopeValue,
  PropertyStatusValue,
  PropertyType,
  PropertyViewValue,
} from '../contracts';

import type {
  PanelPropertyFilterCriteria,
  PanelPropertyListItem,
  PropertyOwnerFilter,
} from './ports/panel-property-list-query';
import type { UserNames } from './ports/user-names';

/** Pidió "mi sucursal" sin tener una asignada. */
export interface NoBranchAssignedError {
  readonly type: 'NoBranchAssigned';
}

/** Los filtros del buscador ya validados por el contract. */
export interface ParsedPanelFilter {
  readonly q?: string | undefined;
  readonly operation?: Operation | undefined;
  readonly propertyType?: PropertyType | undefined;
  readonly status?: PropertyStatusValue | undefined;
  readonly location?: string | undefined;
  readonly currency?: Currency | undefined;
  readonly minPrice?: bigint | undefined;
  readonly maxPrice?: bigint | undefined;
  readonly scope: PropertyScopeValue;
  readonly view: PropertyViewValue;
}

/**
 * Traduce los filtros del buscador a criterios del puerto de consulta: el alcance pasa a captador o
 * sucursal y la papelera la ve solo quien puede borrar. Lo comparten la grilla, el mapa, el
 * comparador, las exportaciones y la edición rápida.
 */
export function resolvePanelFilter(
  filter: ParsedPanelFilter,
  actor: Actor,
  ids?: readonly string[],
): Result<PanelPropertyFilterCriteria, ForbiddenError | NoBranchAssignedError> {
  const deleteRule = OWNERSHIP_RULES.propertiesDelete;
  if (filter.view === 'trash' && !actor.can(deleteRule.own) && !actor.can(deleteRule.all)) {
    return err({ type: 'Forbidden' });
  }

  let owner: PropertyOwnerFilter;
  switch (filter.scope) {
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

  return ok({
    view: filter.view,
    owner,
    text: filter.q,
    operation: filter.operation,
    propertyType: filter.propertyType,
    status: filter.status,
    location: filter.location,
    price:
      filter.currency === undefined
        ? undefined
        : { currency: filter.currency, minCents: filter.minPrice, maxCents: filter.maxPrice },
    ids,
  });
}

/**
 * Criterios de "estas propiedades" (selección por IDs, comparador): solo las de la cartera. Sin
 * IDs, toda la cartera activa (para sumarle otro criterio, como el propietario).
 */
export function idsCriteria(ids: readonly string[] | undefined): PanelPropertyFilterCriteria {
  return {
    view: 'active',
    owner: { kind: 'all' },
    text: undefined,
    operation: undefined,
    propertyType: undefined,
    status: undefined,
    location: undefined,
    price: undefined,
    ids,
  };
}

/** Resuelve los nombres de captador y de quién borró, por ID, para una página de filas. */
export async function toPanelRows(
  items: readonly PanelPropertyListItem[],
  users: UserNames,
): Promise<PanelPropertyRow[]> {
  const userIds = new Set<string>();
  for (const item of items) {
    if (item.producerUserId !== undefined) userIds.add(item.producerUserId);
    if (item.deletedBy !== undefined) userIds.add(item.deletedBy);
  }
  const names = await users.names([...userIds]);
  const ref = (id: string | undefined) =>
    id === undefined ? undefined : { id, name: names.get(id) };

  return items.map(({ producerUserId, deletedBy, ...item }) => ({
    ...item,
    producer: ref(producerUserId),
    deletedBy: ref(deletedBy),
  }));
}

/** Una selección ya validada: IDs marcados en la página o "todas las que cumplen el filtro". */
export type ParsedSelection =
  | { readonly kind: 'ids'; readonly ids: readonly string[] }
  | { readonly kind: 'filter'; readonly filter: ParsedPanelFilter };

export function resolveSelection(
  selection: ParsedSelection,
  actor: Actor,
): Result<PanelPropertyFilterCriteria, ForbiddenError | NoBranchAssignedError> {
  return selection.kind === 'ids'
    ? ok(idsCriteria(selection.ids))
    : resolvePanelFilter(selection.filter, actor);
}
