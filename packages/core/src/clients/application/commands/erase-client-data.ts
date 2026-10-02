import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  EraseClientDataInputSchema,
  type EraseClientDataInput,
  type EraseClientDataOutput,
} from '../../contracts';
import {
  clientErased,
  clientsToErase,
  confirmsErasure,
  erasureRecord,
  MAX_ERASED_MERGED_CLIENTS,
  type ErasureNotConfirmedError,
  type ErasureRequestInFutureError,
} from '../../domain/client-erasure';
import {
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type EraseClientDataError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ErasureNotConfirmedError
  | ErasureRequestInFutureError;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3) → comienzo de ese día en UTC. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/**
 * Supresión de datos de un cliente (Ley 25.326), a su pedido. Borra físicamente al cliente, sus
 * duplicados unificados, todo lo suyo en el módulo y sus entradas de auditoría, y deja una
 * constancia sin datos personales. `clients.client_erased` hace que cada módulo borre lo suyo.
 * Pide `clients:erase`, poder ver el contacto y escribir su nombre como segunda confirmación.
 */
export class EraseClientData {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: EraseClientDataInput,
    actor: Actor,
  ): Promise<Result<EraseClientDataOutput, EraseClientDataError>> {
    if (!actor.can('clients:erase')) return err({ type: 'Forbidden' });

    const parsed = EraseClientDataInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const data = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(
      async (tx): Promise<Result<EraseClientDataOutput, EraseClientDataError>> => {
        const client = await findClient(tx.clients, data.clientId);
        if (!client) return err({ type: 'ClientNotFound' });
        if (!canActOn(actor, OWNERSHIP_RULES.clientsRead, client.ownership)) {
          return err({ type: 'Forbidden' });
        }
        if (!confirmsErasure(client, data.confirmation)) {
          return err({ type: 'ErasureNotConfirmed' });
        }
        const record = erasureRecord({
          id: this.deps.ids.next(),
          clientId: client.id,
          requestedAt: startOfDay(data.requestedOn),
          executedBy: actor.id,
          now,
        });
        if (record.isErr()) return err(record.error);

        const erasedClientIds = clientsToErase(
          client,
          await tx.erasure.mergedInto(client.id, MAX_ERASED_MERGED_CLIENTS),
        );
        await tx.erasure.erase(erasedClientIds, now);
        await tx.erasure.record(record.value);
        await tx.events.publish([clientErased(client.id, erasedClientIds, now)]);
        // Después del borrado y sin `clientIds`: solo el ID suprimido, que no es un dato personal.
        await tx.audit.record(
          auditAction(
            actor,
            { action: 'client.erased', entityType: 'client', entityId: client.id, clientIds: [] },
            {
              erasedClients: { before: null, after: erasedClientIds.length },
              requestedOn: { before: null, after: data.requestedOn },
            },
          ),
        );
        return ok({ erasedClientIds });
      },
    );
  }
}
