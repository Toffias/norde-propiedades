import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  diffChanges,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ReassignClientInputSchema, type ReassignClientInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  clientAuditState,
  clientTarget,
  findClient,
  invalidInput,
  resolveAgent,
  type AgentNotFoundError,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type ReassignClientError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | AgentNotFoundError;

/**
 * Cambia el agente responsable de un contacto (`clients:reassign`, sobre uno que el actor puede
 * ver). El contacto pasa a la sucursal del agente nuevo.
 */
export class ReassignClient {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly agents: ClientAgents;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ReassignClientInput,
    actor: Actor,
  ): Promise<Result<void, ReassignClientError>> {
    if (!actor.can('clients:reassign')) return err({ type: 'Forbidden' });

    const parsed = ReassignClientInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const agent = await resolveAgent(this.deps.agents, parsed.data.agentId ?? undefined);
    if (agent.isErr()) return err(agent.error);
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReassignClientError>> => {
      const client = await findClient(tx.clients, parsed.data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, OWNERSHIP_RULES.clientsRead, client.ownership)) {
        return err({ type: 'Forbidden' });
      }
      const before = clientAuditState(client);
      const changed = client.assignAgent(agent.value, now);
      if (changed.isErr()) return err(changed.error);
      if (!changed.value) return ok(undefined);

      await tx.clients.save(client, actor.id);
      await tx.events.publish(client.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          clientTarget('client.reassigned', client.id),
          diffChanges(before, clientAuditState(client)),
        ),
      );
      return ok(undefined);
    });
  }
}
