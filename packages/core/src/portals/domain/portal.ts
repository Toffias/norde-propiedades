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

/** Los canales de la bandeja (módulo clients) con que entran las consultas de los portales. */
export type PortalLeadChannel = 'mercadolibre' | 'zonaprop';

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
  /**
   * El canal de la bandeja de consultas con que entran los contactos de sus avisos, si el sistema
   * ya los trae. Sin canal, el portal todavía no trae consultas.
   */
  readonly leadChannel: PortalLeadChannel | undefined;
  /** Si el portal cobra por publicar (en ML, el paquete contratado; en Zonaprop, los créditos). */
  readonly paid: boolean;
  /**
   * Si una vez por día se lee del portal cómo están los avisos, para reflejar los que el portal
   * venció, cerró o pausó por moderación (MercadoLibre). Zonaprop no vence ni modera avisos.
   */
  readonly reconciles: boolean;
}

export const PORTAL_CATALOG: Readonly<Record<PortalId, PortalDefinition>> = {
  mercadolibre: {
    provider: 'mercadolibre',
    connection: 'oauth',
    publishes: ['property'],
    listingScope: 'operation',
    choosesPlan: false,
    linksExisting: false,
    leadChannel: 'mercadolibre',
    paid: true,
    reconciles: true,
  },
  // Los emprendimientos de MercadoLibre (un aviso con las unidades como variantes) todavía no se
  // publican desde Norde: la cuenta se conecta, pero no publica nada.
  mercadolibre_developments: {
    provider: 'mercadolibre',
    connection: 'oauth',
    publishes: [],
    listingScope: 'operation',
    choosesPlan: false,
    linksExisting: false,
    // Sus consultas entran aunque todavía no publique: los avisos que hoy publica Tokko.
    leadChannel: 'mercadolibre',
    paid: true,
    reconciles: true,
  },
  zonaprop: {
    provider: 'zonaprop',
    connection: 'account_code',
    publishes: ['property', 'development'],
    listingScope: 'property',
    choosesPlan: true,
    linksExisting: true,
    leadChannel: 'zonaprop',
    paid: true,
    reconciles: false,
  },
};

export function isPortalId(value: string): value is PortalId {
  return PORTALS.some((portal) => portal === value);
}

/** Si la cuenta publica ese tipo de aviso. */
export function portalPublishes(portal: PortalId, kind: ListingOwnerKind): boolean {
  return PORTAL_CATALOG[portal].publishes.includes(kind);
}
