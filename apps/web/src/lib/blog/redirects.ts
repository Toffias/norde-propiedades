import type { Redirect } from '../../payload-types';
import { routes } from '../seo/routes';

/** Destino de una redirección del admin: un post (por referencia) o una URL propia. */
export function redirectDestination(redirect: Redirect): string | null {
  const to = redirect.to;
  if (to?.type === 'reference') {
    const value = to.reference?.value;
    return value !== undefined && typeof value === 'object' ? routes.post(value.slug) : null;
  }
  if (to?.type === 'custom' && to.url) {
    // Solo rutas del sitio o URLs absolutas http(s): nunca `javascript:` ni `//host`.
    if (/^\/(?!\/)/.test(to.url) || /^https?:\/\//i.test(to.url)) return to.url;
  }
  return null;
}
