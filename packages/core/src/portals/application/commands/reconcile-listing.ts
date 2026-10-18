import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import { applyRemoteState, listingIdOf } from '../listing-support';
import type { PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalCredentialsMissingError } from '../ports/portal-connector';
import type { PortalListingStateReader } from '../ports/portal-listing-states';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type ReconcileListingError =
  ForbiddenError | ValidationFailedError | PortalUnavailableError | PortalCredentialsMissingError;

/**
 * La conciliación de un solo aviso, cuando el portal avisa que cambió (`NotifyListingChanged`): lee
 * cómo está y lo refleja en la publicación, como la conciliación diaria (`ReconcileListings`).
 * Devuelve si la publicación cambió. Una publicación que ya no existe, que se dio de baja o que no
 * tiene aviso no es un error: no hay nada que leer.
 */
export class ReconcileListing {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly reader: PortalListingStateReader;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListingIdInput,
    actor: Actor,
  ): Promise<Result<boolean, ReconcileListingError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = listingIdOf(parsed.value.listingId);
    if (id === undefined) return ok(false);

    const listing = await this.deps.uow.run((tx) => tx.listings.findById(id));
    if (!listing || listing.isFinished) return ok(false);
    const { portal, externalId } = listing.toSnapshot();
    if (externalId === undefined || !PORTAL_CATALOG[portal].reconciles) return ok(false);

    const states = await this.deps.reader.states(portal, [externalId]);
    if (states.isErr()) return err(states.error);
    const state = states.value.get(externalId);
    if (state === undefined) return ok(false);
    return ok(await applyRemoteState(this.deps, id, state, actor));
  }
}
