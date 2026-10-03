import { accessScope, OWNERSHIP_RULES } from '../../identity';
import type { Actor } from '../../shared';
import type { DevelopmentUnitImportRow } from '../contracts';

import type { DevelopmentUnitImportItem } from './ports/development-unit-import-query';
import type { UserNames } from './ports/user-names';

// Lo que comparten el pedido de una importación de unidades, el job que la procesa y su historial.

/** Clave del Excel subido: la genera el sistema, nunca sale del nombre del archivo. */
export function unitImportKey(importId: string): string {
  return `imports/development-units/${importId}`;
}

/** Importar unidades es crearlas y editarlas: pide crear propiedades y editar emprendimientos. */
export function canImportUnits(actor: Actor): boolean {
  return (
    actor.can('properties:create') &&
    accessScope(actor, OWNERSHIP_RULES.developmentsUpdate) !== undefined
  );
}

/** Una importación del historial, con el nombre de quién la pidió. */
export async function toUnitImportRows(
  users: UserNames,
  items: readonly DevelopmentUnitImportItem[],
): Promise<DevelopmentUnitImportRow[]> {
  const names = await users.names([...new Set(items.map((item) => item.requestedBy))]);
  return items.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    status: item.status,
    totals: item.totals,
    failure: item.failure,
    requestedBy: { id: item.requestedBy, name: names.get(item.requestedBy) },
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
  }));
}
