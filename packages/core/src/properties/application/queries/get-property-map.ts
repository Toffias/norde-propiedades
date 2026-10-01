import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  MAX_MAP_PINS,
  PropertyMapQuerySchema,
  type PropertyMapQuery,
  type PropertyMapResult,
} from '../../contracts';
import { resolvePanelFilter, type NoBranchAssignedError } from '../panel-filter';
import type { PanelPropertyListQuery } from '../ports/panel-property-list-query';

export type GetPropertyMapError =
  | ForbiddenError
  | { readonly type: 'InvalidSearch'; readonly issues: readonly string[] }
  | NoBranchAssignedError;

/**
 * Pines del mapa del buscador: las propiedades con coordenadas dentro del área visible que cumplen
 * los filtros. Como mucho `MAX_MAP_PINS`; si hay más, se avisa para que se acerque el mapa.
 */
export class GetPropertyMap {
  constructor(private readonly deps: { readonly properties: PanelPropertyListQuery }) {}

  async execute(
    input: PropertyMapQuery,
    actor: Actor,
  ): Promise<Result<PropertyMapResult, GetPropertyMapError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });

    const parsed = PropertyMapQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { south, west, north, east, ...filter } = parsed.data;
    const criteria = resolvePanelFilter(filter, actor);
    if (criteria.isErr()) return err(criteria.error);

    const slice = await this.deps.properties.mapPins(
      criteria.value,
      { south, west, north, east },
      MAX_MAP_PINS,
    );
    const pins = slice.items.flatMap((item) =>
      item.coordinates === undefined
        ? []
        : [
            {
              id: item.id,
              code: item.code,
              status: item.status,
              propertyType: item.propertyType,
              portalTitle: item.portalTitle,
              latitude: item.coordinates.latitude,
              longitude: item.coordinates.longitude,
              operations: item.operations,
            },
          ],
    );
    return ok({ pins, total: slice.total, truncated: slice.total > pins.length });
  }
}
