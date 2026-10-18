import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { PortalListingNoticeInputSchema, type PortalListingNoticeInput } from '../../contracts';
import type { ListingChangedOnPortal } from '../../domain/listing.events';
import { PORTAL_CATALOG, type PortalId } from '../../domain/portal';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type NotifyListingChangedError = ForbiddenError | ValidationFailedError;

/**
 * El portal avisó que cambió uno de los avisos de una cuenta (MercadoLibre: tópico `items`, con
 * el `user_id` y el ID del aviso). Si es el aviso de una publicación de Norde que sigue viva en una
 * cuenta que se concilia, pide leer cómo quedó (`portals.listing_changed_on_portal`): lo hace un
 * job, porque el portal espera la respuesta enseguida. Si no, se ignora y devuelve `undefined`.
 * El aviso no es un dato: el estado se vuelve a leer de la API.
 */
export class NotifyListingChanged {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: PortalListingNoticeInput,
    actor: Actor,
  ): Promise<Result<{ readonly portal: PortalId | undefined }, NotifyListingChangedError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalListingNoticeInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { provider, externalAccountId, remoteId } = parsed.value;

    return this.deps.uow.run(async (tx) => {
      const account = (await tx.accounts.all()).find((candidate) => {
        const definition = PORTAL_CATALOG[candidate.portal];
        return (
          definition.provider === provider &&
          definition.reconciles &&
          candidate.toSnapshot().connection?.externalAccountId === externalAccountId
        );
      });
      if (!account) return ok({ portal: undefined });

      const [listing] = await tx.listings.findByExternalIds(account.portal, [remoteId]);
      if (!listing || listing.isFinished) return ok({ portal: undefined });

      const event: ListingChangedOnPortal = {
        type: 'portals.listing_changed_on_portal',
        aggregateId: listing.id,
        occurredAt: this.deps.clock.now(),
        payload: { listingId: listing.id },
      };
      await tx.events.publish([event]);
      return ok({ portal: account.portal });
    });
  }
}
