export const PROPERTY_STATUSES = [
  'draft',
  'available',
  'reserved',
  'sold',
  'rented',
  'paused',
  'withdrawn',
] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

/**
 * Transiciones válidas entre estados. Una reservada vuelve a estar disponible si la reserva se cae;
 * una vendida o alquilada vuelve a estar disponible si se relista (por ejemplo, al terminar el
 * contrato). Una dada de baja se puede retomar como disponible o como borrador.
 */
const TRANSITIONS: Readonly<Record<PropertyStatus, readonly PropertyStatus[]>> = {
  draft: ['available', 'withdrawn'],
  available: ['reserved', 'paused', 'sold', 'rented', 'withdrawn'],
  reserved: ['available', 'sold', 'rented', 'withdrawn'],
  paused: ['available', 'withdrawn'],
  sold: ['available', 'withdrawn'],
  rented: ['available', 'withdrawn'],
  withdrawn: ['available', 'draft'],
};

export function canTransition(from: PropertyStatus, to: PropertyStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Estados que se eligen a mano (edición rápida, ficha). "Reservada" no: la marca el alta de una
 * reserva (#13), que además guarda el cliente y la seña.
 */
export const MANUAL_STATUSES: readonly PropertyStatus[] = PROPERTY_STATUSES.filter(
  (status) => status !== 'reserved',
);

/**
 * Estados que se ofrecen como disponibles (agente de IA, seguimientos, unidades de un
 * emprendimiento). Una reservada ya no se ofrece.
 */
export const PUBLICLY_LISTED_STATUSES: readonly PropertyStatus[] = ['available'];

/**
 * Estados que se muestran en la web (buscador y ficha). Una reservada sigue visible, con la
 * portada "Reservado" (decisión del 2026-11-15).
 */
export const WEB_LISTED_STATUSES: readonly PropertyStatus[] = ['available', 'reserved'];

export interface ListingVisibility {
  readonly status: PropertyStatus;
  readonly publishedOnWeb: boolean;
}

/**
 * Un borrador todavía no se ofreció: para el público no existe (404), no "ya no está disponible".
 * Si volvió a borrador después de una baja, su ficha ya dejó de ofrecerse antes, con la baja.
 */
export function isUnreleased(property: Pick<ListingVisibility, 'status'>): boolean {
  return property.status === 'draft';
}

/** Una propiedad se muestra al público si está disponible y marcada "Publicar en web". */
export function isPubliclyListed(property: ListingVisibility): boolean {
  return property.publishedOnWeb && PUBLICLY_LISTED_STATUSES.includes(property.status);
}

/** Una propiedad se muestra en la web si está disponible o reservada y marcada "Publicar en web". */
export function isListedOnWeb(property: ListingVisibility): boolean {
  return property.publishedOnWeb && WEB_LISTED_STATUSES.includes(property.status);
}

/** Para quién se lista: la web muestra también las reservadas; el agente de IA, no. */
export type PublicAudience = 'web' | 'offer';

export function listedStatusesFor(audience: PublicAudience): readonly PropertyStatus[] {
  return audience === 'web' ? WEB_LISTED_STATUSES : PUBLICLY_LISTED_STATUSES;
}

export function isListedFor(audience: PublicAudience, property: ListingVisibility): boolean {
  return audience === 'web' ? isListedOnWeb(property) : isPubliclyListed(property);
}
