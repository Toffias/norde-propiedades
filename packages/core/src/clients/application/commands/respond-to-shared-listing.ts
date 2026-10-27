import {
  auditAction,
  err,
  ok,
  parseId,
  type Actor,
  type Clock,
  type ForbiddenError,
  type IdGenerator,
  type Result,
} from '../../../shared';
import {
  ReactToSharedListingInputSchema,
  SharedListingTokenInputSchema,
  type ReactToSharedListingInput,
  type SharedListingTokenInput,
} from '../../contracts';
import { listingReactionActivity, listingViewedActivity } from '../../domain/client-activity';
import type {
  ListingNotInSendError,
  SharedListing,
  SharedListingUnavailableError,
} from '../../domain/shared-listing';
import { clientTarget } from '../client-support';
import type { ClientsTransaction, ClientsUnitOfWork } from '../ports/clients-transaction';
import type { SharedListingTokens } from '../ports/shared-listing-ports';
import type { SharedListingNotFoundError } from './revoke-shared-listing';

/** Lo que puede hacer el sitio público con el link de un envío (`system:web`). */
const RESPOND_PERMISSION = 'clients:respond-to-listings';

export type OpenSharedListingError =
  ForbiddenError | SharedListingNotFoundError | SharedListingUnavailableError;

export type ReactToSharedListingError =
  | ForbiddenError
  | SharedListingNotFoundError
  | SharedListingUnavailableError
  | ListingNotInSendError;

interface Deps {
  readonly uow: ClientsUnitOfWork;
  readonly tokens: SharedListingTokens;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** El envío del token, o nada: un token mal formado o desconocido es lo mismo. */
async function findByToken(
  tx: ClientsTransaction,
  tokens: SharedListingTokens,
  token: string,
): Promise<SharedListing | undefined> {
  return tx.sharedListings.findByTokenHash(tokens.hashOf(token));
}

/**
 * El cliente abrió el link de un envío: suma una apertura a cada propiedad. La primera queda en su
 * actividad y en su historial; las siguientes solo cuentan.
 */
export class OpenSharedListing {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: SharedListingTokenInput,
    actor: Actor,
  ): Promise<Result<void, OpenSharedListingError>> {
    if (!actor.can(RESPOND_PERMISSION)) return err({ type: 'Forbidden' });
    const parsed = SharedListingTokenInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'SharedListingNotFound' });
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, OpenSharedListingError>> => {
      const listing = await findByToken(tx, this.deps.tokens, parsed.data.token);
      if (!listing) return err({ type: 'SharedListingNotFound' });
      const opened = listing.open(now);
      if (opened.isErr()) return err(opened.error);
      await tx.sharedListings.save(listing, actor.id);
      if (!opened.value.first) return ok(undefined);

      await tx.activities.add(
        listingViewedActivity({
          id: this.deps.ids.next(),
          clientId: listing.clientId,
          opportunityId: listing.opportunityId,
          actorId: actor.id,
          now,
        }),
        actor.id,
      );
      await tx.audit.record(
        auditAction(actor, clientTarget('client.listing_send_opened', listing.clientId), {
          sharedListingId: { before: null, after: listing.id },
        }),
      );
      return ok(undefined);
    });
  }
}

/**
 * "Me gusta" o "no me gusta" del cliente a una propiedad del envío. Queda en su actividad y su
 * historial, y dispara la regla de la oportunidad. Repetir la misma reacción no hace nada.
 */
export class ReactToSharedListing {
  constructor(private readonly deps: Deps) {}

  async execute(
    input: ReactToSharedListingInput,
    actor: Actor,
  ): Promise<Result<void, ReactToSharedListingError>> {
    if (!actor.can(RESPOND_PERMISSION)) return err({ type: 'Forbidden' });
    const parsed = ReactToSharedListingInputSchema.safeParse(input);
    if (!parsed.success) return err({ type: 'SharedListingNotFound' });
    const propertyId = parseId<'Property'>(parsed.data.propertyId);
    if (propertyId.isErr()) return err({ type: 'ListingNotInSend' });
    const { reaction } = parsed.data;
    const now = this.deps.clock.now();

    return this.deps.uow.run(async (tx): Promise<Result<void, ReactToSharedListingError>> => {
      const listing = await findByToken(tx, this.deps.tokens, parsed.data.token);
      if (!listing) return err({ type: 'SharedListingNotFound' });
      const before = listing
        .toSnapshot()
        .items.find((item) => item.propertyId === propertyId.value)?.reaction;
      const reacted = listing.react(propertyId.value, reaction, now);
      if (reacted.isErr()) return err(reacted.error);
      if (!reacted.value) return ok(undefined);

      await tx.sharedListings.save(listing, actor.id);
      await tx.activities.add(
        listingReactionActivity({
          id: this.deps.ids.next(),
          clientId: listing.clientId,
          opportunityId: listing.opportunityId,
          propertyId: propertyId.value,
          reaction,
          actorId: actor.id,
          now,
        }),
        actor.id,
      );
      await tx.events.publish(listing.pullEvents());
      await tx.audit.record(
        auditAction(actor, clientTarget('client.listing_reacted', listing.clientId), {
          sharedListingId: { before: null, after: listing.id },
          propertyId: { before: null, after: propertyId.value },
          reaction: { before: before ?? null, after: reaction },
        }),
      );
      return ok(undefined);
    });
  }
}
