import { accessScope, canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { RevokeSharedListingInputSchema, type RevokeSharedListingInput } from '../../contracts';
import {
  clientTarget,
  findClient,
  invalidInput,
  type ClientNotFoundError,
  type InvalidInputError,
} from '../client-support';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

export interface SharedListingNotFoundError {
  readonly type: 'SharedListingNotFound';
}

export type RevokeSharedListingError =
  ForbiddenError | InvalidInputError | ClientNotFoundError | SharedListingNotFoundError;

/**
 * Corta el link de un envío antes de que venza: deja de abrirse y de aceptar reacciones. Lo hace
 * quien puede editar el contacto, y queda en su historial. Revocar uno ya revocado no hace nada.
 */
export class RevokeSharedListing {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: RevokeSharedListingInput,
    actor: Actor,
  ): Promise<Result<void, RevokeSharedListingError>> {
    const rule = OWNERSHIP_RULES.clientsUpdate;
    if (accessScope(actor, rule) === undefined) return err({ type: 'Forbidden' });

    const parsed = RevokeSharedListingInputSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const id = parseId<'SharedListing'>(parsed.data.sharedListingId);
    if (id.isErr()) return err({ type: 'SharedListingNotFound' });
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, RevokeSharedListingError>> => {
      const client = await findClient(tx.clients, parsed.data.clientId);
      if (!client) return err({ type: 'ClientNotFound' });
      if (!canActOn(actor, rule, client.ownership)) return err({ type: 'Forbidden' });
      const listing = await tx.sharedListings.findById(id.value);
      if (listing?.clientId !== client.id) return err({ type: 'SharedListingNotFound' });

      if (!listing.revoke(now)) return ok(undefined);
      await tx.sharedListings.save(listing, actor.id);
      await tx.audit.record(
        auditAction(actor, clientTarget('client.listing_send_revoked', client.id), {
          sharedListingId: { before: listing.id, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
