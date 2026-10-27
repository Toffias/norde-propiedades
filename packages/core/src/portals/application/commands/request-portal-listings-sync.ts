import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  RequestPortalListingsSyncInputSchema,
  type RequestPortalListingsSyncInput,
} from '../../contracts';
import type { ListingId } from '../../domain/listing';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type RequestPortalListingsSyncError = ForbiddenError | ValidationFailedError;

/** Publicaciones por tanda: cada una se pide en su transacción. */
const BATCH_SIZE = 100;
/** Tope de tandas por corrida: diez mil avisos en un portal no son de una inmobiliaria. */
const MAX_BATCHES = 100;

/**
 * Pide sincronizar, por tandas, las publicaciones de un portal:
 * - `live`: las que tienen aviso, porque cambió algo que va en todos (el pie de Mi empresa, el
 *   contacto de una sucursal). Si lo que se manda no cambió, el job no llama al portal.
 * - `failed`: las que quedaron con error (el portal no respondió o no había créditos), para que
 *   vuelvan a intentar solas sin que nadie toque la propiedad. Lo corre un job diario.
 */
export class RequestPortalListingsSync {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: RequestPortalListingsSyncInput,
    actor: Actor,
  ): Promise<Result<{ readonly requested: number }, RequestPortalListingsSyncError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(RequestPortalListingsSyncInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, scope } = parsed.value;

    let after: ListingId | undefined;
    let requested = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const count = await this.deps.uow.run(async (tx) => {
        const page = { after, limit: BATCH_SIZE };
        const listings =
          scope === 'live'
            ? await tx.listings.findLiveOnPortal(portal, page)
            : await tx.listings.findFailedOnPortal(portal, page);
        const now = this.deps.clock.now();
        const events = listings.flatMap((listing) => {
          listing.requestSync(now);
          return listing.pullEvents();
        });
        await tx.events.publish(events);
        after = listings.at(-1)?.id;
        return { listings: listings.length, events: events.length };
      });
      requested += count.events;
      if (count.listings < BATCH_SIZE) break;
    }
    return ok({ requested });
  }
}
