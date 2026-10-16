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

/**
 * Cómo se arma el aviso de una propiedad:
 * - `operation`: un aviso por operación (en MercadoLibre, venta y alquiler van en categorías
 *   distintas).
 * - `property`: un solo aviso con todas las operaciones con precio (Zonaprop: consume un crédito).
 */
export const LISTING_SCOPES = ['operation', 'property'] as const;

export type ListingScope = (typeof LISTING_SCOPES)[number];

export interface PortalDefinition {
  readonly provider: PortalProvider;
  readonly connection: PortalConnectionMethod;
  /** Lo que se publica con la cuenta. Vacío: todavía no publica nada. */
  readonly publishes: readonly ListingOwnerKind[];
  readonly listingScope: ListingScope;
  /**
   * Si el aviso lleva un plan del portal, elegido entre los que tiene contratados la cuenta (en
   * Zonaprop: Simple, Home…). Sin plan, el aviso es simple o destacado (MercadoLibre).
   */
  readonly choosesPlan: boolean;
  /**
   * Si se pueden vincular los avisos que la cuenta ya tiene online, publicados por otro sistema
   * (Tokko), sin republicarlos.
   */
  readonly linksExisting: boolean;
  /** Si el portal cobra por publicar (en ML, el paquete contratado; en Zonaprop, los créditos). */
  readonly paid: boolean;
}

export const PORTAL_CATALOG: Readonly<Record<PortalId, PortalDefinition>> = {
  mercadolibre: {
    provider: 'mercadolibre',
    connection: 'oauth',
    publishes: ['property'],
    listingScope: 'operation',
    choosesPlan: false,
    linksExisting: false,
    paid: true,
  },
  mercadolibre_developments: {
    provider: 'mercadolibre',
    connection: 'oauth',
    publishes: ['development'],
    listingScope: 'operation',
    choosesPlan: false,
    linksExisting: false,
    paid: true,
  },
  // Los emprendimientos llegan en la etapa 5 de Zonaprop.
  zonaprop: {
    provider: 'zonaprop',
    connection: 'account_code',
    publishes: ['property'],
    listingScope: 'property',
    choosesPlan: true,
    linksExisting: true,
    paid: true,
  },
};

export function isPortalId(value: string): value is PortalId {
  return PORTALS.some((portal) => portal === value);
}

/** Si la cuenta publica ese tipo de aviso. */
export function portalPublishes(portal: PortalId, kind: ListingOwnerKind): boolean {
  return PORTAL_CATALOG[portal].publishes.includes(kind);
}
