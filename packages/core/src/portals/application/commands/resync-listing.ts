import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import { listingIdOf, type ListingNotFoundError } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type ResyncListingError = ForbiddenError | ValidationFailedError | ListingNotFoundError;

/**
 * "Sincronizar" desde la ficha: vuelve a llevar la publicación al portal, por ejemplo después de
 * un error. No cambia datos (no se audita): solo pide el job.
 */
export class ResyncListing {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: ListingIdInput, actor: Actor): Promise<Result<void, ResyncListingError>> {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = listingIdOf(parsed.value.listingId);
    if (id === undefined) return err({ type: 'ListingNotFound' });

    return this.deps.uow.run(async (tx): Promise<Result<void, ResyncListingError>> => {
      const listing = await tx.listings.findById(id);
      if (!listing) return err({ type: 'ListingNotFound' });
      listing.requestSync(this.deps.clock.now());
      await tx.events.publish(listing.pullEvents());
      return ok(undefined);
    });
  }
}
