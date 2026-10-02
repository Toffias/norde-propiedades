import type { AuditTarget } from '../../shared';
import type { ClientImportRow } from '../contracts';

import type { ClientAgents } from './ports/client-agents';
import type { ClientImportItem } from './ports/client-import-query';
import { userNames, userRef } from './record-support';

// Lo que comparten el pedido de una importación y el job que la procesa.

/** Clave del Excel subido: la genera el sistema, nunca sale del nombre del archivo. */
export function clientImportKey(importId: string): string {
  return `imports/clients/${importId}`;
}

/** Sin `clientIds`: la importación no guarda datos de un cliente en particular. */
export function importTarget(action: string, importId: string): AuditTarget {
  return { action, entityType: 'client_import', entityId: importId, clientIds: [] };
}

/** Una importación del historial, con los nombres de quién la pidió y del agente. */
export async function toImportRows(
  agents: ClientAgents,
  items: readonly ClientImportItem[],
): Promise<ClientImportRow[]> {
  const names = await userNames(
    agents,
    items.flatMap((item) => [item.requestedBy, item.agentId]),
  );
  return items.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    status: item.status,
    totals: item.totals,
    failure: item.failure,
    requestedBy: userRef(item.requestedBy, names),
    agent: userRef(item.agentId, names),
    createdAt: item.createdAt,
    startedAt: item.startedAt,
    finishedAt: item.finishedAt,
  }));
}
