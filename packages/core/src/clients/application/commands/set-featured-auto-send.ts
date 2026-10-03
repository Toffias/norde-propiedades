import { accessScope, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SetFeaturedAutoSendInputSchema, type SetFeaturedAutoSendInput } from '../../contracts';
import type { ClientInTrashError } from '../../domain/client';
import {
  clientTarget,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import { findEditableClient } from '../saved-search-support';

/** La propiedad no está destacada para el contacto. */
export interface FeaturedListingNotFoundError {
  readonly type: 'FeaturedListingNotFound';
}

export type SetFeaturedAutoSendError =
  | ForbiddenError
  | InvalidInputError
  | ClientNotFoundError
  | ClientInTrashError
  | FeaturedListingNotFoundError;

/**
 * Prende o apaga el auto-envío de novedades de una destacada: si el contacto recibe por email los
 * cambios de esa propiedad (los envíos llegan con #11, etapa 4). Si ya estaba así, no hace nada.
 */
export class SetFeaturedAutoSend {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: SetFeaturedAutoSendInput,
    actor: Actor,
  ): Promise<Result<void, SetFeaturedAutoSendError>> {
    if (accessScope(actor, OWNERSHIP_RULES.clientsUpdate) === undefined) {
      return err({ type: 'Forbidden' });
    }
    const parsed = SetFeaturedAutoSendInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const propertyId = parsed.data.propertyId.toLowerCase();
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, SetFeaturedAutoSendError>> => {
      const client = await findEditableClient(tx, actor, parsed.data.clientId);
      if (client.isErr()) return err(client.error);
      const [listing] = await tx.featured.findActive(client.value.id, [propertyId]);
      if (!listing) return err({ type: 'FeaturedListingNotFound' });
      const before = listing.autoSendUpdates;
      if (!listing.setAutoSendUpdates(parsed.data.enabled, now)) return ok(undefined);

      await tx.featured.save(listing, actor.id);
      await tx.audit.record(
        auditAction(actor, clientTarget('client.featured_auto_send_changed', client.value.id), {
          propertyId: { before: propertyId, after: propertyId },
          autoSendUpdates: { before, after: listing.autoSendUpdates },
        }),
      );
      return ok(undefined);
    });
  }
}
