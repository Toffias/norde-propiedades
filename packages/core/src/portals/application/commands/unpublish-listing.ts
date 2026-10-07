import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import { editListing, type ListingEditError } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput } from '../portals-input';

export type UnpublishListingError = ListingEditError;

/** Da de baja el aviso en el portal. Es definitivo: para volver se publica un aviso nuevo. */
export class UnpublishListing {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: ListingIdInput, actor: Actor): Promise<Result<void, UnpublishListingError>> {
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    return editListing({
      uow: this.deps.uow,
      actor,
      listingId: parsed.value.listingId,
      action: 'property.portal_unpublish_requested',
      change: (listing) => {
        const before = listing.toSnapshot().intent;
        return ok(
          listing.unpublish(this.deps.clock.now())
            ? { [`listings.${listing.id}.intent`]: { before, after: 'closed' } }
            : undefined,
        );
      },
    });
  }
}
