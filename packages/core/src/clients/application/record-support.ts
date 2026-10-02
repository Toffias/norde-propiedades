import { canActOn, OWNERSHIP_RULES } from '../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../shared';
import type { ClientActivityActor, ClientUserRef } from '../contracts';
import type { Client } from '../domain/client';

import { findClient, type ClientNotFoundError } from './client-support';
import type { ClientAgents } from './ports/client-agents';
import type { ClientsUnitOfWork } from './ports/clients-transaction';

// Lo que comparten las pestañas de la ficha: actividad, oportunidades, destacadas y búsquedas.

/** El contacto, si el actor puede verlo. */
export async function findReadableClient(
  uow: ClientsUnitOfWork,
  actor: Actor,
  clientId: string,
): Promise<Result<Client, ForbiddenError | ClientNotFoundError>> {
  const client = await uow.run((tx) => findClient(tx.clients, clientId));
  if (!client) return err({ type: 'ClientNotFound' });
  if (!canActOn(actor, OWNERSHIP_RULES.clientsRead, client.ownership)) {
    return err({ type: 'Forbidden' });
  }
  return ok(client);
}

/** Puede editar el contacto: agregarle notas y destacarle propiedades. No en la papelera. */
export function canWorkOn(actor: Actor, client: Client): boolean {
  return !client.isDeleted && canActOn(actor, OWNERSHIP_RULES.clientsUpdate, client.ownership);
}

const AGENT_ACTOR_ID = 'system:agent-ia';

/** Los usuarios de una página, por ID (los actores de sistema no se buscan). */
export async function userNames(
  agents: ClientAgents,
  ids: readonly (string | undefined)[],
): Promise<ReadonlyMap<string, string>> {
  const users = [...new Set(ids)].filter(
    (id): id is string => id !== undefined && !id.startsWith('system:'),
  );
  return users.length === 0 ? new Map() : agents.names(users);
}

export function activityActor(
  actorId: string,
  names: ReadonlyMap<string, string>,
): ClientActivityActor {
  if (actorId === AGENT_ACTOR_ID) return { kind: 'agent' };
  if (actorId.startsWith('system:')) return { kind: 'system' };
  return { kind: 'user', id: actorId, name: names.get(actorId) };
}

export function userRef(
  id: string | undefined,
  names: ReadonlyMap<string, string>,
): ClientUserRef | undefined {
  if (id === undefined || id.startsWith('system:')) return undefined;
  return { id, name: names.get(id) };
}
