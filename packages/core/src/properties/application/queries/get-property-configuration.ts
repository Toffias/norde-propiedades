import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { GridColumnValue, PropertyTypeSettingRow } from '../../contracts';
import { RECOMMENDED_ATTRIBUTES } from '../../domain/property-type-settings';
import type { PropertyCatalogQuery } from '../ports/property-catalog-query';

export interface PropertyConfiguration {
  /** Los ocho tipos, en el orden del catálogo. */
  readonly types: readonly PropertyTypeSettingRow[];
  readonly gridColumns: readonly GridColumnValue[];
}

/**
 * Configuración del módulo: tipos habilitados con sus atributos, y columnas de la grilla. La lee
 * el buscador (columnas, tipos del alta) y Mi empresa.
 */
export class GetPropertyConfiguration {
  constructor(private readonly deps: { readonly catalog: PropertyCatalogQuery }) {}

  async execute(actor: Actor): Promise<Result<PropertyConfiguration, ForbiddenError>> {
    if (!actor.can('properties:read') && !actor.can('settings:read')) {
      return err({ type: 'Forbidden' });
    }
    const [types, gridColumns] = await Promise.all([
      this.deps.catalog.typeSettings(),
      this.deps.catalog.gridColumns(),
    ]);
    return ok({
      types: types.map((setting) => ({
        propertyType: setting.kind,
        isEnabled: setting.isEnabled,
        visibleAttributes: setting.visibleAttributes,
        recommendedAttributes: RECOMMENDED_ATTRIBUTES[setting.kind],
      })),
      gridColumns,
    });
  }
}
