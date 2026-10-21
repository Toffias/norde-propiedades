import type { Actor, AuditTarget } from '../../shared';
import type { PropertyImportRow } from '../contracts';

import type { PropertyImportItem } from './ports/property-import-query';
import type { UserNames } from './ports/user-names';

// Lo que comparten el pedido de una importación de Tokko, el job y el historial.

/** Quién puede importar (y ver el historial de importaciones). */
export function canImportProperties(actor: Actor): boolean {
  return actor.can('properties:import');
}

/** Clave del archivo subido: la genera el sistema, nunca sale del nombre del archivo. */
export function propertyImportKey(importId: string): string {
  return `imports/properties/${importId}`;
}

/** Sin `clientIds`: la importación no guarda datos de un cliente en particular. */
export function propertyImportTarget(action: string, importId: string): AuditTarget {
  return { action, entityType: 'property_import', entityId: importId, clientIds: [] };
}

/** Las importaciones del historial, con el nombre de quién las pidió. */
export async function toPropertyImportRows(
  users: UserNames,
  items: readonly PropertyImportItem[],
): Promise<PropertyImportRow[]> {
  const names = await users.names([...new Set(items.map((item) => item.requestedBy))]);
  return items.map((item) => {
    const name = names.get(item.requestedBy);
    return {
      id: item.id,
      source: item.source,
      fileName: item.fileName,
      status: item.status,
      totals: item.totals,
      failure: item.failure,
      requestedBy: name === undefined ? undefined : { id: item.requestedBy, name },
      createdAt: item.createdAt,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
    };
  });
}
