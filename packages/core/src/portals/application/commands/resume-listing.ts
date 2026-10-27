import { err, ok, type Actor, type Clock, type Result } from '../../../shared';
import { ListingIdInputSchema, type ListingIdInput } from '../../contracts';
import type { ListingClosedError } from '../../domain/listing';
import { PORTAL_CATALOG } from '../../domain/portal';
import { checkPlanCredits, type ListingPlanError } from '../listing-plan';
import { editListing, listingIdOf, type ListingEditError } from '../listing-support';
import type { PortalAccountDirectory } from '../ports/portal-account-directory';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput } from '../portals-input';

export type ResumeListingError = ListingEditError | ListingClosedError | ListingPlanError;

/**
 * Reactiva un aviso pausado por el equipo. Si la propiedad está reservada o pausada, el aviso
 * sigue en pausa hasta que vuelva a estar disponible. En los portales con plan (Zonaprop), un aviso
 * pausado está offline y volver a ponerlo online consume un crédito: antes se revisa que queden.
 */
export class ResumeListing {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly directory: PortalAccountDirectory;
      readonly clock: Clock;
    },
  ) {}

  async execute(input: ListingIdInput, actor: Actor): Promise<Result<void, ResumeListingError>> {
    if (!actor.can('portals:publish')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ListingIdInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const credits = await this.#checkCredits(parsed.value.listingId);
    if (credits.isErr()) return err(credits.error);

    return editListing({
      uow: this.deps.uow,
      actor,
      listingId: parsed.value.listingId,
      action: 'portal_resume_requested',
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

  /** Los créditos del plan del aviso, si reactivarlo consume uno. Es una llamada externa. */
  async #checkCredits(listingId: string): Promise<Result<void, ListingPlanError>> {
    const id = listingIdOf(listingId);
    if (id === undefined) return ok(undefined);
    const found = await this.deps.uow.run(async (tx) => {
      const listing = await tx.listings.findById(id);
      return listing && { listing, account: await tx.accounts.get(listing.portal) };
    });
    // Sin publicación, `editListing` devuelve el error.
    if (!found) return ok(undefined);
    const { portal, owner } = found.listing;
    const { plan, intent } = found.listing.toSnapshot();
    const connection = found.account.toSnapshot().connection;
    if (
      !PORTAL_CATALOG[portal].choosesPlan ||
      plan === undefined ||
      intent !== 'paused' ||
      connection === undefined
    ) {
      return ok(undefined);
    }
    return checkPlanCredits(this.deps.directory, {
      portal,
      externalAccountId: connection.externalAccountId,
      plan,
      publishes: owner.kind,
    });
  }
}
