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

/** Estados que se ofrecen al público (web, agente de IA). Una reservada ya no se ofrece. */
export const PUBLICLY_LISTED_STATUSES: readonly PropertyStatus[] = ['available'];

export interface ListingVisibility {
  readonly status: PropertyStatus;
  readonly publishedOnWeb: boolean;
}

/** Una propiedad se muestra al público si está disponible y marcada "Publicar en web". */
export function isPubliclyListed(property: ListingVisibility): boolean {
  return property.publishedOnWeb && PUBLICLY_LISTED_STATUSES.includes(property.status);
}
