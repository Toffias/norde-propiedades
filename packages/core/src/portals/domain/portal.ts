/**
 * Portales donde Norde publica. MercadoLibre usa dos cuentas: el paquete de emprendimientos de ML
 * deja a su cuenta publicando solo emprendimientos, así que las propiedades van por otra.
 * Zonaprop usa una sola cuenta.
 */
export const PORTALS = ['mercadolibre', 'mercadolibre_developments', 'zonaprop'] as const;

export type PortalId = (typeof PORTALS)[number];

/** Qué se publica en cada cuenta: propiedades sueltas o emprendimientos con sus unidades. */
export const LISTING_OWNER_KINDS = ['property', 'development'] as const;

export type ListingOwnerKind = (typeof LISTING_OWNER_KINDS)[number];

/** Plataforma detrás del portal: las cuentas de un mismo proveedor comparten la integración. */
export type PortalProvider = 'mercadolibre' | 'zonaprop';

/**
 * Cómo se vincula la cuenta:
 * - `oauth`: el usuario autoriza a Norde en el portal (MercadoLibre).
 * - `account_code`: Norde ya es integrador del portal y la cuenta se elige por su código
 *   (en Zonaprop, el código de inmobiliaria).
 */
export const PORTAL_CONNECTION_METHODS = ['oauth', 'account_code'] as const;

export type PortalConnectionMethod = (typeof PORTAL_CONNECTION_METHODS)[number];

export interface PortalDefinition {
  readonly provider: PortalProvider;
  readonly connection: PortalConnectionMethod;
  /** Lo que se publica con la cuenta. Vacío: todavía no publica nada. */
  readonly publishes: readonly ListingOwnerKind[];
  /** Si el portal cobra por publicar (en ML, el paquete contratado; en Zonaprop, los créditos). */
  readonly paid: boolean;
}

export const PORTAL_CATALOG: Readonly<Record<PortalId, PortalDefinition>> = {
  mercadolibre: {
    provider: 'mercadolibre',
    connection: 'oauth',
    publishes: ['property'],
    paid: true,
  },
  mercadolibre_developments: {
    provider: 'mercadolibre',
    connection: 'oauth',
    publishes: ['development'],
    paid: true,
  },
  // La publicación llega en la etapa 2 de Zonaprop: por ahora la cuenta solo se conecta.
  zonaprop: { provider: 'zonaprop', connection: 'account_code', publishes: [], paid: true },
};

export function isPortalId(value: string): value is PortalId {
  return PORTALS.some((portal) => portal === value);
}

/** Si la cuenta publica ese tipo de aviso. */
export function portalPublishes(portal: PortalId, kind: ListingOwnerKind): boolean {
  return PORTAL_CATALOG[portal].publishes.includes(kind);
}
