import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import type { ListingClosedError } from '../../domain/listing';
import { editListing, type ListingEditError } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput } from '../portals-input';

export type ResumeListingError = ListingEditError | ListingClosedError;

/**
 * Reactiva un aviso pausado por el equipo. Si la propiedad está reservada o pausada, el aviso
 * sigue en pausa hasta que vuelva a estar disponible.
 */
export class ResumeListing {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: ListingIdInput, actor: Actor): Promise<Result<void, ResumeListingError>> {
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    return editListing({
      uow: this.deps.uow,
      actor,
      listingId: parsed.value.listingId,
      action: 'property.portal_resume_requested',
      change: (listing) =>
        listing
          .resume(this.deps.clock.now())
          .andThen((changed) =>
            ok(
              changed
                ? { [`listings.${listing.id}.intent`]: { before: 'paused', after: 'active' } }
                : undefined,
            ),
          ),
    });
  }
}
