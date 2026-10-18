import {
  PORTAL_CATALOG,
  type PortalId,
  type PortalLeadSource,
  type PortalProvider,
} from '@norde/core/portals';

/**
 * Una fuente de contactos para todos los portales: cada lectura va a la del proveedor del portal
 * (MercadoLibre o Zonaprop). El core recibe una sola y no sabe de proveedores.
 */
export class PortalLeadSourcesByProvider implements PortalLeadSource {
  constructor(private readonly sources: Readonly<Record<PortalProvider, PortalLeadSource>>) {}

  recent(input: Parameters<PortalLeadSource['recent']>[0]) {
    return this.#of(input.portal).recent(input);
  }

  #of(portal: PortalId): PortalLeadSource {
    return this.sources[PORTAL_CATALOG[portal].provider];
  }
}
