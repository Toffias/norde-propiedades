import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ListingOwnerInputSchema, type ListingOwnerInput } from '../../contracts';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type RequestListingSyncError = ForbiddenError | ValidationFailedError;

/**
 * Reacción a un cambio de la propiedad o del emprendimiento (datos, precio, estado, fotos o sus
 * unidades): pide sincronizar cada publicación viva. Si lo que se manda no cambió, el job no llama al
 * portal.
 */
export class RequestListingSync {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: ListingOwnerInput,
    actor: Actor,
  ): Promise<Result<{ readonly requested: number }, RequestListingSyncError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListingOwnerInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const owner = parsed.value;

    const now = this.deps.clock.now();
    return this.deps.uow.run(async (tx) => {
      const listings =
        'developmentId' in owner
          ? await tx.listings.findForDevelopment(owner.developmentId)
          : await tx.listings.findForProperty(owner.propertyId);
      const events = listings.flatMap((listing) => {
        listing.requestSync(now);
        return listing.pullEvents();
      });
      await tx.events.publish(events);
      return ok({ requested: events.length });
    });
  }
}
