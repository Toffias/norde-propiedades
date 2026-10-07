import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import type { ListingClosedError } from '../../domain/listing';
import { editListing, type ListingEditError } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput } from '../portals-input';

export type PauseListingError = ListingEditError | ListingClosedError;

/** Pausa el aviso en el portal (sigue existiendo, pero no se muestra). */
export class PauseListing {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: ListingIdInput, actor: Actor): Promise<Result<void, PauseListingError>> {
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    return editListing({
      uow: this.deps.uow,
      actor,
      listingId: parsed.value.listingId,
      action: 'property.portal_pause_requested',
      change: (listing) =>
        listing
          .pause(this.deps.clock.now())
          .andThen((changed) =>
            ok(
              changed
                ? { [`listings.${listing.id}.intent`]: { before: 'active', after: 'paused' } }
                : undefined,
            ),
          ),
    });
  }
}
