import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  PropertyListingsInputSchema,
  type PropertyListingsInput,
  type PropertyListingsView,
} from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import { toListingView } from '../listing-support';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type GetPropertyListingsError = ForbiddenError | ValidationFailedError;

/**
 * La pestaña Difusión de la ficha: las publicaciones de la propiedad y los portales activos donde
 * se puede publicar. La ve quien publica o quien administra las cuentas.
 */
export class GetPropertyListings {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork }) {}

  async execute(
    input: PropertyListingsInput,
    actor: Actor,
  ): Promise<Result<PropertyListingsView, GetPropertyListingsError>> {
    const canPublish = actor.can('portals:publish');
    if (!canPublish && !actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PropertyListingsInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);

    const { listings, accounts } = await this.deps.uow.run(async (tx) => ({
      listings: await tx.listings.findForProperty(parsed.value.propertyId),
      accounts: await tx.accounts.all(),
    }));
    return ok({
      listings: listings.map(toListingView),
      portals: accounts
        .filter((a) => a.canPublish && PORTAL_CATALOG[a.portal].publishes === 'property')
        .map((a) => a.portal),
      canPublish,
    });
  }
}
