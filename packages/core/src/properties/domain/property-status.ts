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

/** La dirección exacta solo se muestra si el equipo lo habilitó en la propiedad. */
export function publicAddress(property: {
  readonly address: string | null;
  readonly showExactAddress: boolean;
}): string | null {
  return property.showExactAddress ? property.address : null;
}
