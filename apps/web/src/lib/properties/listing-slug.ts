/** El largo máximo que acepta el core: más largo no puede ser una ficha. */
const MAX_SLUG_LENGTH = 200;

/** Lo que genera `propertySlug` del core: minúsculas, números y guiones simples. */
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Si el texto puede ser el slug de una ficha. Si no, la ficha da 404 sin consultar la base ni
 * guardar nada en el caché.
 */
export function isListingSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && SLUG_SHAPE.test(slug);
}
