import { canActOn, OWNERSHIP_RULES } from '../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../shared';
import type {
  ClientActivityActor,
  ClientActivityRow,
  ClientUserRef,
  OpportunityStageRef,
} from '../contracts';
import type { Client } from '../domain/client';

import { findClient, type ClientNotFoundError } from './client-support';
import type { ClientAgents } from './ports/client-agents';
import type { ClientActivityItem } from './ports/client-record-query';
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

/** Los estados por ID, con su nombre y color de hoy: solo si la página tiene cambios de estado. */
async function stageRefs(
  uow: ClientsUnitOfWork,
  items: readonly ClientActivityItem[],
): Promise<ReadonlyMap<string, OpportunityStageRef>> {
  if (!items.some((item) => item.body.kind === 'status_change')) return new Map();
  const stages = await uow.run((tx) => tx.stages.findAll());
  return new Map(
    stages.map((stage) => {
      const { id, name, color } = stage.toSnapshot();
      return [id, { id, name, color }];
    }),
  );
}

/** Una página de actividad lista para mostrar: quién la hizo y, en los cambios, qué estados. */
export async function toActivityRows(
  items: readonly ClientActivityItem[],
  deps: { readonly uow: ClientsUnitOfWork; readonly agents: ClientAgents },
): Promise<ClientActivityRow[]> {
  const names = await userNames(
    deps.agents,
    items.map((item) => item.actorId),
  );
  const stages = await stageRefs(deps.uow, items);
  const stage = (id: string | undefined) => (id === undefined ? undefined : stages.get(id));
  return items.map((item): ClientActivityRow => {
    const common = {
      id: item.id,
      occurredAt: item.occurredAt,
      opportunityId: item.opportunityId,
      actor: activityActor(item.actorId, names),
    };
    if (item.body.kind !== 'status_change') return { ...common, ...item.body };
    const { fromStageId, toStageId, ...body } = item.body;
    return { ...common, ...body, fromStage: stage(fromStageId), toStage: stage(toStageId) };
  });
}
