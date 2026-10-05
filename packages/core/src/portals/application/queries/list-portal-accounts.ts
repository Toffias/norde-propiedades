import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { PortalAccountsView } from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import type { PortalAccountRepository } from '../../domain/portals.repository';

export type ListPortalAccountsError = ForbiddenError;

/** Las cuentas de portales para Mi empresa → Portales. Las ve quien conecta o quien publica. */
export class ListPortalAccounts {
  constructor(private readonly deps: { readonly accounts: PortalAccountRepository }) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<PortalAccountsView, ListPortalAccountsError>> {
    const canManage = actor.can('portals:manage');
    if (!canManage && !actor.can('portals:publish')) return err({ type: 'Forbidden' });

    const accounts = await this.deps.accounts.all();
    return ok({
      canManage,
      accounts: accounts.map((account) => {
        const { portal, isEnabled, connection } = account.toSnapshot();
        const definition = PORTAL_CATALOG[portal];
        return {
          portal,
          publishes: definition.publishes,
          paid: definition.paid,
          isEnabled,
          isConnected: connection !== undefined,
          accountName: connection?.accountName,
          connectedAt: connection?.connectedAt,
        };
      }),
    });
  }
}
