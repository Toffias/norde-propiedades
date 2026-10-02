import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { UnlinkClientsInputSchema, type UnlinkClientsInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UnlinkClientsError =
  ForbiddenError | InvalidInputError | ClientNotFoundError | ClientInTrashError;

/**
 * Quita una relación entre dos contactos. La puede quitar quien edita cualquiera de los dos: desde
 * la ficha de una empresa se saca a alguien que ya no trabaja ahí.
 */
export class UnlinkClients {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UnlinkClientsInput,
    actor: Actor,
  ): Promise<Result<void, UnlinkClientsError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = UnlinkClientsInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { clientId, relatedClientId, kind } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UnlinkClientsError>> => {
      const client = await findClient(tx.clients, clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      const related = await findClient(tx.clients, relatedClientId);
      const allowed =
        canActOn(actor, rule, client.ownership) ||
        (related !== undefined && canActOn(actor, rule, related.ownership));
      if (!allowed) return err({ type: 'Forbidden' });

      const relation = client.relations.find(
        (r) => r.relatedClientId === relatedClientId && r.kind === kind,
      );
      const unlinked = client.unlink(relatedClientId, kind, now);
      if (unlinked.isErr()) return err(unlinked.error);
      if (!unlinked.value) return ok(undefined);

      await tx.clients.save(client, actor.id);
      await tx.events.publish(client.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          {
            action: 'client.unlinked',
            entityType: 'client',
            entityId: client.id,
            clientIds: [client.id, relatedClientId],
          },
          {
            relatedClientId: { before: relatedClientId, after: null },
            relationKind: { before: kind, after: null },
            relationLabel: { before: relation?.label ?? null, after: null },
          },
        ),
      );
      return ok(undefined);
    });
  }
}
