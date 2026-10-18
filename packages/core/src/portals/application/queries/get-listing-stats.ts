import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput, type ListingStatsView } from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import { listingIdOf, type ListingNotFoundError } from '../listing-support';
import type { PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalCredentialsMissingError } from '../ports/portal-connector';
import type { PortalListingStatsReader } from '../ports/portal-listing-stats';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

/** El portal no da estadísticas (Zonaprop), o la publicación todavía no tiene aviso. */
export interface ListingStatsNotAvailableError {
  readonly type: 'ListingStatsNotAvailable';
}

export type GetListingStatsError =
  | ForbiddenError
  | ValidationFailedError
  | ListingNotFoundError
  | ListingStatsNotAvailableError
  | PortalUnavailableError
  | PortalCredentialsMissingError;

/** Los días que cubren las visitas y los contactos: un mes, como los reportes del portal. */
export const LISTING_STATS_DAYS = 30;

/**
 * Las visitas y los contactos de un aviso (pestaña Difusión), leídos del portal en el momento: no
 * se guardan. Los ve quien publica o quien administra las cuentas, como la pestaña.
 */
export class GetListingStats {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly reader: PortalListingStatsReader;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ListingIdInput,
    actor: Actor,
  ): Promise<Result<ListingStatsView, GetListingStatsError>> {
    if (!actor.can('portals:publish') && !actor.can('portals:manage')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const id = listingIdOf(parsed.value.listingId);
    if (id === undefined) return err({ type: 'ListingNotFound' });

    const listing = await this.deps.uow.run((tx) => tx.listings.findById(id));
    if (!listing) return err({ type: 'ListingNotFound' });
    const { portal, externalId } = listing.toSnapshot();
    if (externalId === undefined || !PORTAL_CATALOG[portal].stats) {
      return err({ type: 'ListingStatsNotAvailable' });
    }

    const stats = await this.deps.reader.stats({
      portal,
      externalId,
      endingAt: this.deps.clock.now(),
      days: LISTING_STATS_DAYS,
    });
    if (stats.isErr()) return err(stats.error);
    const { totalVisits, visits, questions, phoneViews, whatsapp } = stats.value;
    return ok({
      listingId: listing.id,
      days: LISTING_STATS_DAYS,
      totalVisits,
      visits,
      questions,
      phoneViews,
      whatsapp,
    });
  }
}
