import {
  PORTAL_CATALOG,
  type PortalConnector,
  type PortalId,
  type PortalListingContent,
  type PortalProvider,
} from '@norde/core/portals';

/**
 * Un conector para todos los portales: cada pedido va al conector del proveedor del portal
 * (MercadoLibre o Zonaprop). El core recibe uno solo y no sabe de proveedores.
 */
export class PortalConnectorsByProvider implements PortalConnector {
  constructor(private readonly connectors: Readonly<Record<PortalProvider, PortalConnector>>) {}

  problems(portal: PortalId, content: PortalListingContent) {
    return this.#of(portal).problems(portal, content);
  }

  create(portal: PortalId, content: PortalListingContent) {
    return this.#of(portal).create(portal, content);
  }

  update(portal: PortalId, externalId: string, change: Parameters<PortalConnector['update']>[2]) {
    return this.#of(portal).update(portal, externalId, change);
  }

  close(portal: PortalId, externalId: string) {
    return this.#of(portal).close(portal, externalId);
  }

  #of(portal: PortalId): PortalConnector {
    return this.connectors[PORTAL_CATALOG[portal].provider];
  }
}
