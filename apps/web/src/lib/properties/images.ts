/**
 * Las fotos importadas sin archivo propio vienen de otro dominio: se muestran tal cual, sin pasar
 * por el optimizador de `next/image` (que solo acepta las rutas del sitio).
 */
export function isExternal(src: string): boolean {
  return /^https?:\/\//.test(src);
}
