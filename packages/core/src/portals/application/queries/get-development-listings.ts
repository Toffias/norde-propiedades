import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  DevelopmentListingsInputSchema,
  type DevelopmentListingsInput,
  type PropertyListingsView,
} from '../../contracts';
import { PORTAL_CATALOG, portalPublishes } from '../../domain/portal';
import { toListingView } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type GetDevelopmentListingsError = ForbiddenError | ValidationFailedError;

/**
 * La pestaña Difusión del emprendimiento: sus publicaciones y los portales activos que publican
 * emprendimientos. La ve quien publica o quien administra las cuentas.
 */
export class GetDevelopmentListings {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork }) {}

  async execute(
    input: DevelopmentListingsInput,
    actor: Actor,
  ): Promise<Result<PropertyListingsView, GetDevelopmentListingsError>> {
    const canPublish = actor.can('portals:publish');
    if (!canPublish && !actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(DevelopmentListingsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);

    const { listings, accounts } = await this.deps.uow.run(async (tx) => ({
      listings: await tx.listings.findForDevelopment(parsed.value.developmentId),
      accounts: await tx.accounts.all(),
    }));
    return ok({
      listings: listings.map(toListingView),
      portals: accounts
        .filter((a) => a.canPublish && portalPublishes(a.portal, 'development'))
        .map((a) => ({
          portal: a.portal,
          // Un emprendimiento es un solo aviso con todas sus unidades.
          listingScope: 'property' as const,
          choosesPlan: PORTAL_CATALOG[a.portal].choosesPlan,
          linksExisting: PORTAL_CATALOG[a.portal].linksExisting,
          unitsAsListings: PORTAL_CATALOG[a.portal].unitsAsListings,
        })),
      canPublish,
    });
  }
}
