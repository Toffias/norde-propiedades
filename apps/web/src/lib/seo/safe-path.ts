/**
 * Ruta relativa del propio sitio (`/blog/x`). Rechaza `//host`, `/\host` y esquemas, para que
 * un redirect armado con un query param no lleve a otro dominio (open redirect).
 */
export function isSafeRelativePath(path: string): boolean {
  return /^\/(?![/\\])[^\s]*$/.test(path) && path.length <= 1024;
}
