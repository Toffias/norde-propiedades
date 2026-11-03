import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { canSeePortals } from '../portals-access';
import type { LinkedListingCountsView, PortalAccountsView } from '../../contracts';
import { PORTAL_CATALOG, type ListingOwnerKind } from '../../domain/portal';
import type { PortalAccountRepository } from '../../domain/portals.repository';
import type { PortalListingCount, PortalListingCounter } from '../ports/portal-listing-counts';

export type ListPortalAccountsError = ForbiddenError;

/** Las cuentas de portales para Mi empresa → Portales. Las ve quien puede ver la difusión. */
export class ListPortalAccounts {
  constructor(
    private readonly deps: {
      readonly accounts: PortalAccountRepository;
      readonly counter: PortalListingCounter;
    },
  ) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<PortalAccountsView, ListPortalAccountsError>> {
    const canManage = actor.can('portals:manage');
    if (!canSeePortals(actor)) return err({ type: 'Forbidden' });

    const [accounts, counts] = await Promise.all([
      this.deps.accounts.all(),
      this.deps.counter.countLinked(),
    ]);
    return ok({
      canManage,
      accounts: accounts.map((account) => {
        const { portal, connection } = account.toSnapshot();
        const definition = PORTAL_CATALOG[portal];
        const own = counts.filter((c) => c.portal === portal);
        return {
          portal,
          connection: definition.connection,
          publishes: definition.publishes,
          paid: definition.paid,
          linksExisting: definition.linksExisting,
          // Desconectada no se publica, aunque recuerde que estaba activa.
          isEnabled: account.canPublish,
          isConnected: connection !== undefined,
          needsReconnect: account.needsReconnect,
          accountName: connection?.accountName,
          externalAccountId: connection?.externalAccountId,
          connectedAt: connection?.connectedAt,
          linked: {
            property: linkedCounts(own, 'property'),
            development: linkedCounts(own, 'development'),
          },
        };
      }),
    });
  }
}

function linkedCounts(
  counts: readonly PortalListingCount[],
  kind: ListingOwnerKind,
): LinkedListingCountsView {
  const of = (status: PortalListingCount['status']) =>
    counts.find((c) => c.ownerKind === kind && c.status === status)?.count ?? 0;
  return { published: of('published'), paused: of('paused'), error: of('error') };
}
