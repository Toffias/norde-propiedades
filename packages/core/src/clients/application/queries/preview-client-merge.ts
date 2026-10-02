import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  PreviewClientMergeInputSchema,
  type ClientMergePreview,
  type ClientMergeSide,
  type PreviewClientMergeInput,
} from '../../contracts';
import type { Client } from '../../domain/client';
import {
  findClient,
  invalidInput,
  masksOwnerContact,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientRecordCounts } from '../ports/client-linked-records';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type PreviewClientMergeError = ForbiddenError | InvalidInputError | ClientNotFoundError;

function side(
  client: Client,
  records: ClientRecordCounts,
  names: ReadonlyMap<string, string>,
): ClientMergeSide {
  const s = client.toSnapshot();
  return {
    id: s.id,
    kind: s.kind,
    name: s.name,
    phones: s.phones.map((p) => p.phone.e164),
    emails: s.emails.map((e) => e.email.value),
    clientTypes: s.clientTypes,
    agent: s.agentId === undefined ? undefined : { id: s.agentId, name: names.get(s.agentId) },
    tagCount: s.tagIds.length,
    relationCount: s.relations.length + records.incomingRelations,
    createdAt: s.createdAt,
    records,
  };
}

/**
 * Los dos contactos lado a lado antes de unificarlos, con lo que cuelga de cada uno, para elegir
 * cuál queda. Pide los mismos permisos que unificar.
 */
export class PreviewClientMerge {
  constructor(
    private readonly deps: { readonly uow: ClientsUnitOfWork; readonly agents: ClientAgents },
  ) {}

  async execute(
    input: PreviewClientMergeInput,
    actor: Actor,
  ): Promise<Result<ClientMergePreview, PreviewClientMergeError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (!actor.can('clients:merge') || accessScope(actor, rule) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = PreviewClientMergeInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));

    const loaded = await this.deps.uow.run(async (tx) => {
      const primary = await findClient(tx.clients, parsed.data.primaryId);
      const duplicate = await findClient(tx.clients, parsed.data.duplicateId);
      if (!primary || !duplicate) return undefined;
      return {
        primary,
        duplicate,
        primaryRecords: await tx.records.countFor(primary.id),
        duplicateRecords: await tx.records.countFor(duplicate.id),
      };
    });
    if (!loaded || loaded.primary.isDeleted || loaded.duplicate.isDeleted) {
      return err({ type: 'ClientNotFound' });
    }
    const { primary, duplicate } = loaded;
    for (const client of [primary, duplicate]) {
      if (
        !canActOn(actor, rule, client.ownership) ||
        masksOwnerContact(actor, client.toSnapshot().clientTypes)
      ) {
        return err({ type: 'Forbidden' });
      }
    }

    const agentIds = [primary, duplicate].flatMap((c) => c.ownership.ownerId ?? []);
    const names = await this.deps.agents.names(agentIds);
    return ok({
      primary: side(primary, loaded.primaryRecords, names),
      duplicate: side(duplicate, loaded.duplicateRecords, names),
    });
  }
}
