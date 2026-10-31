import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  MAX_MAP_PINS,
  PropertyMapQuerySchema,
  type PropertyMapPin,
  type PropertyMapQuery,
  type PropertyMapResult,
} from '../../contracts';
import { toCover } from '../cover-urls';
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
    const located = slice.items.flatMap(({ coordinates, ...item }) =>
      coordinates === undefined ? [] : [{ ...item, coordinates }],
    );
    const pins = await Promise.all(
      located.map(async (item): Promise<PropertyMapPin> => ({
        id: item.id,
        code: item.code,
        status: item.status,
        propertyType: item.propertyType,
        portalTitle: item.portalTitle,
        publishAddress: item.publishAddress,
        neighborhood: item.neighborhood,
        city: item.city,
        latitude: item.coordinates.latitude,
        longitude: item.coordinates.longitude,
        operations: item.operations,
        attributes: item.attributes,
        // Sin `storage`, sin firmar: firmar cientos de pines por cada movimiento del mapa no
        // tiene sentido si la foto se ve solo en la tarjeta del pin elegido.
        cover: await toCover(item.cover),
      })),
    );
    return ok({ pins, total: slice.total, truncated: slice.total > pins.length });
  }
}
