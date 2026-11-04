import { createHash } from 'node:crypto';

/**
 * El `externalId` de la consulta de una propiedad dentro de un envío de favoritos. Sale del ID del
 * envío y de la propiedad, siempre igual: si el envío se reintenta después de un error a mitad de
 * camino, las consultas que ya entraron no se duplican (el panel las reconoce por este ID).
 */
export function favoriteExternalId(submissionId: string, propertyId: string): string {
  const hex = createHash('sha256')
    .update(`favorites:${submissionId.toLowerCase()}:${propertyId.toLowerCase()}`)
    .digest('hex');
  // Formato UUID (versión 8, la de los UUID armados a medida) con la variante RFC 9562.
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
