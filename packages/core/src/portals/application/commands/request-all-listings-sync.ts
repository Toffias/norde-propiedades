import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import type { ListingId } from '../../domain/listing';
import { PORTALS } from '../../domain/portal';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';

export type RequestAllListingsSyncError = ForbiddenError;

/** Publicaciones por tanda: cada una se pide en su transacción. */
const BATCH_SIZE = 50;
/** Tope de tandas por portal: diez mil avisos vivos en un portal no son de una inmobiliaria. */
const MAX_BATCHES = 200;

/**
 * Reacción a un cambio fuera de la propiedad que entra en todos los avisos: el contacto de una
 * sucursal, el pie de la descripción para portales o la URL de la ficha en la web. Pide sincronizar
 * cada publicación viva de cada portal; si lo que se manda no cambió, el job no llama al portal.
 */
export class RequestAllListingsSync {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<{ readonly requested: number }, RequestAllListingsSyncError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });

    let requested = 0;
    for (const portal of PORTALS) {
      let after: ListingId | undefined;
      for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const page = await this.deps.uow.run(async (tx) => {
          const listings = await tx.listings.findLiveOnPortal(portal, {
            after,
            limit: BATCH_SIZE,
          });
          const now = this.deps.clock.now();
          const events = listings.flatMap((listing) => {
            listing.requestSync(now);
            return listing.pullEvents();
          });
          await tx.events.publish(events);
          return { last: listings.at(-1), count: listings.length, events: events.length };
        });
        requested += page.events;
        if (page.last === undefined || page.count < BATCH_SIZE) break;
        after = page.last.id;
      }
    }
    return ok({ requested });
  }
}
