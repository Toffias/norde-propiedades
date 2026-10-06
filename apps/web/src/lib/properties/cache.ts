/**
 * Tags de caché de las propiedades (ADR 0023). Las consultas cacheadas de fichas y listados los
 * declaran, y `POST /api/revalidate` los invalida cuando apps/gestion avisa que algo cambió.
 */
export const PROPERTIES_CACHE_TAG = 'properties';

/** La ficha de una propiedad (por id: el slug puede no estar en el aviso). */
export function propertyCacheTag(propertyId: string): string {
  return `property:${propertyId}`;
}

/** Respaldo por si se pierde un aviso: fichas y listados se refrescan solos cada hora. */
export const PROPERTIES_REVALIDATE_SECONDS = 3600;
