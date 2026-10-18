import {
  PORTAL_CATALOG,
  type PortalId,
  type PortalListingCatalog,
  type PortalProvider,
} from '@norde/core/portals';

/**
 * Un catálogo de avisos online para todos los portales: cada pedido va al del proveedor del portal
 * (MercadoLibre o Zonaprop). El core recibe uno solo y no sabe de proveedores.
 */
export class PortalListingCatalogsByProvider implements PortalListingCatalog {
  constructor(private readonly catalogs: Readonly<Record<PortalProvider, PortalListingCatalog>>) {}

  online(input: Parameters<PortalListingCatalog['online']>[0]) {
    return this.#of(input.portal).online(input);
  }

  link(input: Parameters<PortalListingCatalog['link']>[0]) {
    return this.#of(input.portal).link(input);
  }

  onlineDevelopments(input: Parameters<PortalListingCatalog['onlineDevelopments']>[0]) {
    return this.#of(input.portal).onlineDevelopments(input);
  }

  linkDevelopment(input: Parameters<PortalListingCatalog['linkDevelopment']>[0]) {
    return this.#of(input.portal).linkDevelopment(input);
  }

  #of(portal: PortalId): PortalListingCatalog {
    return this.catalogs[PORTAL_CATALOG[portal].provider];
  }
}
