/**
 * Portales donde Norde publica. MercadoLibre usa dos cuentas: el paquete de emprendimientos de ML
 * deja a su cuenta publicando solo emprendimientos, así que las propiedades van por otra.
 */
export const PORTALS = ['mercadolibre', 'mercadolibre_developments'] as const;

export type PortalId = (typeof PORTALS)[number];

/** Qué se publica en cada cuenta: propiedades sueltas o emprendimientos con sus unidades. */
export const LISTING_OWNER_KINDS = ['property', 'development'] as const;

export type ListingOwnerKind = (typeof LISTING_OWNER_KINDS)[number];

/** Plataforma detrás del portal: las cuentas de un mismo proveedor comparten la integración. */
export type PortalProvider = 'mercadolibre';

export interface PortalDefinition {
  readonly provider: PortalProvider;
  readonly publishes: ListingOwnerKind;
  /** Si el portal cobra por publicar (en ML, el paquete contratado). */
  readonly paid: boolean;
}

export const PORTAL_CATALOG: Readonly<Record<PortalId, PortalDefinition>> = {
  mercadolibre: { provider: 'mercadolibre', publishes: 'property', paid: true },
  mercadolibre_developments: { provider: 'mercadolibre', publishes: 'development', paid: true },
};

export function isPortalId(value: string): value is PortalId {
  return PORTALS.some((portal) => portal === value);
}
