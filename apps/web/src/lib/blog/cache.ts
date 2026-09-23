/**
 * Tag de caché de todo el contenido editorial del blog (posts, categorías y autores).
 * Lo usan las consultas cacheadas y lo invalidan los hooks de Payload al publicar.
 * El volumen de cambios es bajo: un solo tag alcanza y evita olvidarse de una página.
 */
export const BLOG_CACHE_TAG = 'blog';

/** Respaldo por si falla una invalidación: el contenido se refresca solo cada hora. */
export const BLOG_REVALIDATE_SECONDS = 3600;
