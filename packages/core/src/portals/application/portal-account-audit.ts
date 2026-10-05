import type { AuditTarget } from '../../shared';
import type { PortalAccount } from '../domain/portal-account';

/** Las cuentas de portal se auditan contra sí mismas: no tienen datos de clientes. */
export function portalAccountTarget(action: string, account: PortalAccount): AuditTarget {
  return { action, entityType: 'portal_account', entityId: account.portal, clientIds: [] };
}

/** La cuenta vinculada, para el diff: el ID y el nombre en el portal. */
export function connectionAuditValue(account: PortalAccount) {
  const connection = account.toSnapshot().connection;
  return connection === undefined
    ? null
    : { externalAccountId: connection.externalAccountId, accountName: connection.accountName };
}
