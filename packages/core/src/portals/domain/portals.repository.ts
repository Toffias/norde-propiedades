import type { Listing, ListingId, ListingOperation, ListingOwner } from './listing';
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
    owner: ListingOwner,
    /**
     * Sin operación: el aviso de la propiedad con todas sus operaciones (Zonaprop), o el del
     * emprendimiento.
     */
    operation: ListingOperation | undefined,
  ): Promise<Listing | undefined>;
  /** Las publicaciones de una propiedad. Son pocas por construcción: una por portal y operación. */
  findForProperty(propertyId: string): Promise<readonly Listing[]>;
  /** Las publicaciones de un emprendimiento: como mucho una por portal. */
  findForDevelopment(developmentId: string): Promise<readonly Listing[]>;
  /** Las publicaciones de esos avisos del portal (por su ID en el portal), las que haya. */
  findByExternalIds(portal: PortalId, externalIds: readonly string[]): Promise<readonly Listing[]>;
  save(listing: Listing, actorId: string): Promise<void>;
}
