import type { Listing, ListingId, ListingOperation } from './listing';
import type { PortalId } from './portal';
import type { PortalAccount } from './portal-account';

export interface PortalAccountRepository {
  /** La cuenta del portal; si nunca se conectó, una sin conectar. */
  get(portal: PortalId): Promise<PortalAccount>;
  /** Todas las cuentas del catálogo, en su orden. */
  all(): Promise<readonly PortalAccount[]>;
  save(account: PortalAccount, actorId: string): Promise<void>;
}

export interface ListingRepository {
  findById(id: ListingId): Promise<Listing | undefined>;
  /**
   * La publicación, bloqueada hasta el fin de la transacción: dos sincronizaciones de la misma
   * publicación no corren a la vez (si no, el portal podría recibir dos avisos).
   */
  lockById(id: ListingId): Promise<Listing | undefined>;
  findOne(
    portal: PortalId,
    propertyId: string,
    operation: ListingOperation,
  ): Promise<Listing | undefined>;
  /** Las publicaciones de una propiedad. Son pocas por construcción: una por portal y operación. */
  findForProperty(propertyId: string): Promise<readonly Listing[]>;
  save(listing: Listing, actorId: string): Promise<void>;
}
