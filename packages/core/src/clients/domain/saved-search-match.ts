// Cuándo una búsqueda guardada de un cliente coincide con una propiedad. El listado de interesados
// lo resuelve en SQL con el mismo criterio (un test de integración verifica que coincidan).

export interface MatchableProperty {
  readonly propertyType: string;
  readonly operations: readonly {
    readonly operation: string;
    readonly currency: string;
    readonly priceCents: bigint | undefined;
  }[];
  readonly locationIds: readonly string[];
  readonly rooms: number | undefined;
}

export interface MatchableSearch {
  readonly operation: string;
  /** Vacío: cualquier tipo. */
  readonly propertyTypes: readonly string[];
  /** Sin moneda: sin rango de precio. */
  readonly currency: string | undefined;
  readonly minPriceCents: bigint | undefined;
  readonly maxPriceCents: bigint | undefined;
  /** Vacío: cualquier ubicación. */
  readonly locationIds: readonly string[];
  readonly minRooms: number | undefined;
}

/**
 * Coincide si la propiedad tiene la operación buscada, es de uno de los tipos, está en una de las
 * ubicaciones (o debajo) y cumple el mínimo de ambientes. Con un rango de precio, el precio de la
 * operación tiene que estar cargado, en la misma moneda y dentro del rango; "a consultar" no entra.
 */
export function matchesSavedSearch(property: MatchableProperty, search: MatchableSearch): boolean {
  const operation = property.operations.find((o) => o.operation === search.operation);
  if (operation === undefined) return false;
  if (search.propertyTypes.length > 0 && !search.propertyTypes.includes(property.propertyType)) {
    return false;
  }
  if (
    search.locationIds.length > 0 &&
    !search.locationIds.some((id) => property.locationIds.includes(id))
  ) {
    return false;
  }
  if (search.minRooms !== undefined && (property.rooms ?? -1) < search.minRooms) return false;

  const hasRange = search.minPriceCents !== undefined || search.maxPriceCents !== undefined;
  if (search.currency === undefined || !hasRange) return true;
  const price = operation.priceCents;
  if (operation.currency !== search.currency || price === undefined) return false;
  if (search.minPriceCents !== undefined && price < search.minPriceCents) return false;
  if (search.maxPriceCents !== undefined && price > search.maxPriceCents) return false;
  return true;
}

/**
 * Qué tanto coincide una propiedad con una búsqueda, de 0 a 100: la proporción de los criterios
 * de la búsqueda que cumple. La operación es excluyente (sin ella da 0) y los criterios que la
 * búsqueda no define no cuentan. Todos valen lo mismo. Da 100 solo si `matchesSavedSearch`.
 */
export function matchScore(property: MatchableProperty, search: MatchableSearch): number {
  const operation = property.operations.find((o) => o.operation === search.operation);
  if (operation === undefined) return 0;

  const checks: boolean[] = [true];
  if (search.propertyTypes.length > 0) {
    checks.push(search.propertyTypes.includes(property.propertyType));
  }
  if (search.locationIds.length > 0) {
    checks.push(search.locationIds.some((id) => property.locationIds.includes(id)));
  }
  if (search.minRooms !== undefined) {
    checks.push((property.rooms ?? -1) >= search.minRooms);
  }
  const hasRange = search.minPriceCents !== undefined || search.maxPriceCents !== undefined;
  if (search.currency !== undefined && hasRange) {
    const price = operation.priceCents;
    checks.push(
      operation.currency === search.currency &&
        price !== undefined &&
        (search.minPriceCents === undefined || price >= search.minPriceCents) &&
        (search.maxPriceCents === undefined || price <= search.maxPriceCents),
    );
  }
  const met = checks.filter(Boolean).length;
  return Math.round((100 * met) / checks.length);
}

/** La coincidencia con la mejor de las búsquedas; sin búsquedas, no hay coincidencia. */
export function bestMatchScore(
  property: MatchableProperty,
  searches: readonly MatchableSearch[],
): number | undefined {
  if (searches.length === 0) return undefined;
  return Math.max(...searches.map((search) => matchScore(property, search)));
}
