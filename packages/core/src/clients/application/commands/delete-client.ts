import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ClientIdInputSchema, type ClientIdInput } from '../../contracts';
import type { ClientAlreadyDeletedError } from '../../domain/client';
import {
  canDeleteClients,
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type DeleteClientError =
  ForbiddenError | InvalidInputError | ClientNotFoundError | ClientAlreadyDeletedError;

/**
 * Manda un contacto a la papelera: los propios con `clients:delete`, los de cualquiera con
 * `clients:delete-others`. No borra nada: se restaura desde la papelera.
 */
export class DeleteClient {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: ClientIdInput, actor: Actor): Promise<Result<void, DeleteClientError>> {
    if (!canDeleteClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ClientIdInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, DeleteClientError>> => {
      const client = await findClient(tx.clients, parsed.data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, OWNERSHIP_RULES.clientsDelete, client.ownership)) {
        return err({ type: 'Forbidden' });
      }
      const deleted = client.delete(actor.id, now);
      if (deleted.isErr()) return err(deleted.error);

      await tx.clients.save(client, actor.id);
      await tx.events.publish(client.pullEvents());
      await tx.audit.record(auditAction(actor, clientTarget('client.deleted', client.id)));
      return ok(undefined);
    });
  }
}
