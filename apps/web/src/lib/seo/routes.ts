// Rutas públicas del sitio: única fuente para links, canonical, sitemap, breadcrumbs y preview.

export const routes = {
  home: () => '/',
  blog: () => '/blog',
  blogPage: (page: number) => (page <= 1 ? '/blog' : `/blog/pagina/${page}`),
  post: (slug: string) => `/blog/${encodeURIComponent(slug)}`,
  category: (slug: string) => `/blog/categoria/${encodeURIComponent(slug)}`,
  categoryPage: (slug: string, page: number) =>
    page <= 1
      ? `/blog/categoria/${encodeURIComponent(slug)}`
      : `/blog/categoria/${encodeURIComponent(slug)}/pagina/${page}`,
  properties: () => '/propiedades',
  property: (slug: string) => `/propiedades/${encodeURIComponent(slug)}`,
  defaultOgImage: () => '/og-image.png',
} as const;

/**
 * Segmentos de `/blog/*` que no pueden usarse como slug de un post
 * (la ruta estática taparía al post).
 */
export const RESERVED_POST_SLUGS: readonly string[] = ['pagina', 'categoria'];

const ABSOLUTE_URL = /^https?:\/\//i;

/**
 * Une la URL del sitio con una ruta relativa, sin barras duplicadas. Una URL que ya es
 * absoluta (Payload devuelve así las de media) se deja como está.
 */
export function absoluteUrl(siteUrl: string, path: string): string {
  if (ABSOLUTE_URL.test(path)) return path;
  const base = siteUrl.replace(/\/+$/, '');
  if (path === '' || path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * URL del propio sitio → ruta relativa (`http://sitio/api/media/x.png` → `/api/media/x.png`).
 * Las URLs de otros dominios (ej. el storage en la nube) se dejan como están.
 */
export function toSitePath(url: string, siteUrl: string): string {
  if (!ABSOLUTE_URL.test(url)) return url;
  const target = new URL(url);
  return target.origin === new URL(siteUrl).origin ? `${target.pathname}${target.search}` : url;
}
