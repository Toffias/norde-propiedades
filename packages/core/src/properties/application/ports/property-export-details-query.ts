import type { PropertyExportDetails } from '../../contracts';

/**
 * Los datos de la planilla que no están en la fila del buscador, de un lote de propiedades (como
 * mucho, uno de la exportación). Los nombres de usuarios, sucursales, emprendimientos y propietarios
 * vienen resueltos: es una lectura para mostrar.
 */
export interface PropertyExportDetailsQuery {
  details(
    propertyIds: readonly string[],
    options: { readonly includeOwners: boolean },
  ): Promise<ReadonlyMap<string, PropertyExportDetails>>;
}
