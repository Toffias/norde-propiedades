import type { PortalId } from './portal';
import type { PortalAccount } from './portal-account';

export interface PortalAccountRepository {
  /** La cuenta del portal; si nunca se conectó, una sin conectar. */
  get(portal: PortalId): Promise<PortalAccount>;
  /** Todas las cuentas del catálogo, en su orden. */
  all(): Promise<readonly PortalAccount[]>;
  save(account: PortalAccount, actorId: string): Promise<void>;
}
