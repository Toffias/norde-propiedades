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
import { UnfeaturePropertyInputSchema, type UnfeaturePropertyInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export type UnfeaturePropertyError =
  ForbiddenError | InvalidInputError | ClientNotFoundError | ClientInTrashError;

/**
 * Quita una propiedad de las destacadas del contacto. Queda como quitada (no se borra), con su
 * reacción si la tenía. Si no estaba destacada, no hace nada.
 */
export class UnfeatureProperty {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: UnfeaturePropertyInput,
    actor: Actor,
  ): Promise<Result<void, UnfeaturePropertyError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = UnfeaturePropertyInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const propertyId = parsed.data.propertyId.toLowerCase();
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UnfeaturePropertyError>> => {
      const client = await findClient(tx.clients, parsed.data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
      if (client.isDeleted) return err({ type: 'ClientInTrash' });

      const [listing] = await tx.featured.findActive(client.id, [propertyId]);
      if (!listing?.remove(now)) return ok(undefined);

      await tx.featured.save(listing, actor.id);
      await tx.audit.record(
        auditAction(actor, clientTarget('client.listing_unfeatured', client.id), {
          propertyId: { before: propertyId, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
