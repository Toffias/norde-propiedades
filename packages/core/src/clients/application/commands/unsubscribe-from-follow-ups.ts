import {
  auditAction,
  err,
  ok,
  toAuditValue,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { SharedListingTokenInputSchema, type SharedListingTokenInput } from '../../contracts';
import type { ClientId } from '../../domain/client';
import { MAX_SAVED_SEARCHES_PER_CLIENT } from '../../domain/saved-search';
import { clientTarget } from '../client-support';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';
import type { SharedListingTokens } from '../ports/shared-listing-ports';
import type { SharedListingNotFoundError } from './revoke-shared-listing';

/** Lo que puede hacer el sitio público con el link de un envío (`system:web`). */
const RESPOND_PERMISSION = 'clients:respond-to-listings';

/** De a cuántas destacadas se apaga el auto-envío. */
const FEATURED_BATCH = 200;

export type UnsubscribeFromFollowUpsError = ForbiddenError | SharedListingNotFoundError;

/**
 * El cliente se da de baja de los seguimientos automáticos desde el link del email (#106): todas
 * sus búsquedas quedan dadas de baja (el asesor no puede volver a prender el envío) y se apaga el
 * auto-envío de sus destacadas. Sirve el token de cualquier envío suyo, aunque haya vencido o se
 * haya revocado. Repetirlo no cambia nada.
 */
export class UnsubscribeFromFollowUps {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly tokens: SharedListingTokens;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: SharedListingTokenInput,
    actor: Actor,
  ): Promise<Result<void, UnsubscribeFromFollowUpsError>> {
    if (!actor.can(RESPOND_PERMISSION)) return err({ type: 'Forbidden' });
    const parsed = SharedListingTokenInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'SharedListingNotFound' });
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, UnsubscribeFromFollowUpsError>> => {
      const listing = await tx.sharedListings.findByTokenHash(
        this.deps.tokens.hashOf(parsed.data.token),
      );
      if (!listing) return err({ type: 'SharedListingNotFound' });
      const { clientId } = listing;

      const searches = await tx.savedSearches.findActiveByClient(
        clientId,
        MAX_SAVED_SEARCHES_PER_CLIENT,
      );
      const unsubscribed = searches.filter((search) => search.unsubscribe(now));
      for (const search of unsubscribed) await tx.savedSearches.save(search, actor.id);
      const featuredIds = await this.turnOffFeatured(tx, clientId, now, actor);
      if (unsubscribed.length === 0 && featuredIds.length === 0) return ok(undefined);

      await tx.audit.record(
        auditAction(actor, clientTarget('client.follow_ups_unsubscribed', clientId), {
          sharedListingId: { before: null, after: listing.id },
          ...(unsubscribed.length > 0
            ? {
                savedSearchIds: {
                  before: null,
                  after: toAuditValue(unsubscribed.map((search) => search.id)),
                },
              }
            : {}),
          ...(featuredIds.length > 0
            ? { featuredListingIds: { before: null, after: toAuditValue(featuredIds) } }
            : {}),
        }),
      );
      return ok(undefined);
    });
  }

  /** Apaga el auto-envío de todas sus destacadas, de a tandas. Devuelve cuáles cambió. */
  private async turnOffFeatured(
    tx: ClientsTransaction,
    clientId: ClientId,
    now: Date,
    actor: Actor,
  ): Promise<string[]> {
    const changed: string[] = [];
    for (;;) {
      const batch = await tx.featured.findAutoSending(clientId, FEATURED_BATCH);
      for (const listing of batch) {
        listing.setAutoSendUpdates(false, now);
        await tx.featured.save(listing, actor.id);
        changed.push(listing.id);
      }
      if (batch.length < FEATURED_BATCH) return changed;
    }
  }
}
