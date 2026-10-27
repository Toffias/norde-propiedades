import {
  PORTAL_CATALOG,
  type PortalId,
  type PortalListingStateReader,
  type PortalProvider,
} from '@norde/core/portals';

/**
 * Un lector del estado de los avisos para todos los portales: cada lectura va a la del proveedor del
 * portal (MercadoLibre o Zonaprop). El core recibe uno solo y no sabe de proveedores.
 */
export class PortalListingStatesByProvider implements PortalListingStateReader {
  constructor(
    private readonly readers: Readonly<Record<PortalProvider, PortalListingStateReader>>,
  ) {}

  states(portal: PortalId, externalIds: readonly string[]) {
    return this.#of(portal).states(portal, externalIds);
  }

  #of(portal: PortalId): PortalListingStateReader {
    return this.readers[PORTAL_CATALOG[portal].provider];
  }
}
