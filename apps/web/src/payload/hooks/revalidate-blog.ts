import { revalidateTag } from 'next/cache';
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
  TypeWithID,
} from 'payload';

import { BLOG_CACHE_TAG } from '../../lib/blog/cache';

type Versioned = TypeWithID & { readonly _status?: 'draft' | 'published' | null };

/**
 * Invalida el caché del blog. `expire: 0`: la próxima visita ya ve el cambio (el editor
 * espera verlo al publicar). Los scripts fuera de Next (seed, migraciones) pasan
 * `context.disableRevalidate`, porque ahí no hay caché que invalidar.
 */
function revalidateBlog(req: PayloadRequest, reason: string): void {
  if (req.context.disableRevalidate) return;
  req.payload.logger.info({ tag: BLOG_CACHE_TAG, reason }, 'Revalidating blog cache');
  try {
    revalidateTag(BLOG_CACHE_TAG, { expire: 0 });
  } catch (error) {
    // Fuera de un request de Next (ej. la publicación programada que corre el cron de jobs)
    // no hay caché que invalidar. No se relanza: haría rollback de la publicación. El
    // contenido se refresca igual con la revalidación por tiempo (BLOG_REVALIDATE_SECONDS).
    req.payload.logger.warn({ err: error, reason }, 'Could not revalidate the blog cache');
  }
}

/** Para colecciones con borradores: solo importa si lo publicado cambió. */
export const revalidatePublished: CollectionAfterChangeHook<Versioned> = ({
  doc,
  previousDoc,
  req,
  collection,
}) => {
  const isPublished = doc._status === 'published';
  // Payload tipa `previousDoc` como siempre presente, pero en un alta no hay versión anterior.
  const wasPublished = (previousDoc as Versioned | undefined)?._status === 'published';
  if (isPublished || wasPublished) revalidateBlog(req, `${collection.slug}:${doc.id}`);
  return doc;
};

/** Para colecciones sin borradores (categorías, autores). */
export const revalidateOnChange: CollectionAfterChangeHook<TypeWithID> = ({
  doc,
  req,
  collection,
}) => {
  revalidateBlog(req, `${collection.slug}:${String(doc.id)}`);
  return doc;
};

export const revalidateOnDelete: CollectionAfterDeleteHook<TypeWithID> = ({
  doc,
  req,
  collection,
}) => {
  revalidateBlog(req, `${collection.slug}:${String(doc.id)}:deleted`);
  return doc;
};
