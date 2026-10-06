import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { ChangeListingTypeInputSchema, type ChangeListingTypeInput } from '../../contracts';
import type { ListingClosedError } from '../../domain/listing';
import { editListing, type ListingEditError } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput } from '../portals-input';

export type ChangeListingTypeError = ListingEditError | ListingClosedError;

/** Pasa el aviso a simple o destacado (consume el cupo de destacados del portal). */
export class ChangeListingType {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: ChangeListingTypeInput,
    actor: Actor,
  ): Promise<Result<void, ChangeListingTypeError>> {
    const parsed = parseInput(ChangeListingTypeInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { listingId, listingType } = parsed.value;
    return editListing({
      uow: this.deps.uow,
      actor,
      listingId,
      action: 'property.portal_type_changed',
      change: (listing) => {
        const before = listing.toSnapshot().listingType;
        return listing
          .changeType(listingType, this.deps.clock.now())
          .andThen((changed) =>
            ok(
              changed
                ? { [`listings.${listing.id}.listingType`]: { before, after: listingType } }
                : undefined,
            ),
          );
      },
    });
  }
}
