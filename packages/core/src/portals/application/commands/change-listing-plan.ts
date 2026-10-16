import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { ChangeListingPlanInputSchema, type ChangeListingPlanInput } from '../../contracts';
import type { ListingClosedError } from '../../domain/listing';
import { PORTAL_CATALOG } from '../../domain/portal';
import type { PortalNotEnabledError } from './request-publication';
import { checkPlanCredits, type ListingPlanError } from '../listing-plan';
import { editListing, listingIdOf, type ListingEditError } from '../listing-support';
import type { PortalAccountDirectory } from '../ports/portal-account-directory';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput } from '../portals-input';

export type ChangeListingPlanError =
  ListingEditError | ListingClosedError | PortalNotEnabledError | ListingPlanError;

/**
 * Cambia el plan del aviso en los portales con plan (Zonaprop): consume un crédito del plan nuevo,
 * así que antes revisa que la cuenta lo tenga y le queden créditos.
 */
export class ChangeListingPlan {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly directory: PortalAccountDirectory;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ChangeListingPlanInput,
    actor: Actor,
  ): Promise<Result<void, ChangeListingPlanError>> {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ChangeListingPlanInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { listingId, plan } = parsed.value;
    const id = listingIdOf(listingId);
    if (id === undefined) return err({ type: 'ListingNotFound' });

    const found = await this.deps.uow.run(async (tx) => {
      const listing = await tx.listings.findById(id);
      return listing && { listing, account: await tx.accounts.get(listing.portal) };
    });
    if (!found) return err({ type: 'ListingNotFound' });
    const { portal } = found.listing;
    if (!PORTAL_CATALOG[portal].choosesPlan) {
      return err({ type: 'ValidationFailed', issues: ['Este portal no usa planes.'] });
    }
    const connection = found.account.toSnapshot().connection;
    if (!found.account.canPublish || connection === undefined) {
      return err({ type: 'PortalNotEnabled', portal });
    }
    if (found.listing.toSnapshot().plan !== plan) {
      const credits = await checkPlanCredits(this.deps.directory, {
        portal,
        externalAccountId: connection.externalAccountId,
        plan,
      });
      if (credits.isErr()) return err(credits.error);
    }

    return editListing({
      uow: this.deps.uow,
      actor,
      listingId,
      action: 'property.portal_plan_changed',
      change: (listing) => {
        const before = listing.toSnapshot().plan ?? null;
        return listing
          .changePlan(plan, this.deps.clock.now())
          .andThen((changed) =>
            ok(changed ? { [`listings.${listing.id}.plan`]: { before, after: plan } } : undefined),
          );
      },
    });
  }
}
