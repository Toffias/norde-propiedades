import type { PropertyInterestProfile } from '@norde/core/clients';
import type { VisibilityFilter } from '@norde/core/identity';
import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';

import { clients, savedSearches } from '../db/schema';

// El cruce de una propiedad con las búsquedas guardadas, en SQL. Replica `matchesSavedSearch` del
// dominio de clients; el test de integración compara los dos.

/** Precio de una operación contra el rango de la búsqueda: sin rango, cualquiera. */
function priceMatches(operation: PropertyInterestProfile['operations'][number]): SQL {
  const noRange = sql`(${savedSearches.currency} is null or (${savedSearches.minPriceCents} is null and ${savedSearches.maxPriceCents} is null))`;
  if (operation.priceCents === undefined) return noRange;
  const price = operation.priceCents;
  return sql`(${noRange} or (${savedSearches.currency} = ${operation.currency}
    and (${savedSearches.minPriceCents} is null or ${savedSearches.minPriceCents} <= ${price})
    and (${savedSearches.maxPriceCents} is null or ${savedSearches.maxPriceCents} >= ${price})))`;
}

/**
 * Búsquedas activas (sin borrar ni dadas de baja, de clientes activos) que coinciden con la
 * propiedad. Sin operaciones, no coincide ninguna.
 */
export function matchingSavedSearches(profile: PropertyInterestProfile): SQL {
  const operations = profile.operations.map(
    (operation) =>
      sql`(${savedSearches.operation} = ${operation.operation} and ${priceMatches(operation)})`,
  );
  const rooms =
    profile.rooms === undefined
      ? sql`${savedSearches.minRooms} is null`
      : sql`(${savedSearches.minRooms} is null or ${savedSearches.minRooms} <= ${profile.rooms})`;
  const locations =
    profile.locationIds.length === 0
      ? sql`cardinality(${savedSearches.locationIds}) = 0`
      : sql`(cardinality(${savedSearches.locationIds}) = 0 or ${savedSearches.locationIds} && ${sql.param([...profile.locationIds])}::uuid[])`;
  return (
    and(
      isNull(savedSearches.deletedAt),
      isNull(savedSearches.unsubscribedAt),
      isNull(clients.deletedAt),
      operations.length === 0 ? sql`false` : or(...operations),
      sql`(cardinality(${savedSearches.propertyTypes}) = 0 or ${profile.propertyType} = any(${savedSearches.propertyTypes}))`,
      locations,
      rooms,
    ) ?? sql`false`
  );
}

/** Los clientes que el actor puede ver: los suyos, los de su sucursal o todos. */
export function visibleClients(visibility: VisibilityFilter): SQL {
  switch (visibility.kind) {
    case 'all':
      return sql`true`;
    case 'own':
      return eq(clients.agentId, visibility.ownerId);
    case 'branch':
      return (
        or(eq(clients.agentId, visibility.ownerId), eq(clients.branchId, visibility.branchId)) ??
        sql`false`
      );
    case 'none':
      return sql`false`;
  }
}
