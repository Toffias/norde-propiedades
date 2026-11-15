import 'server-only';

import config from '@payload-config';
import { unstable_cache } from 'next/cache';
import { getPayload, type Where } from 'payload';
import { cache } from 'react';

import { POSTS_PER_PAGE } from '../pagination';
import type { Category, Media, Post, Redirect } from '../../payload-types';
import { BLOG_CACHE_TAG, BLOG_REVALIDATE_SECONDS } from './cache';

// Lecturas del contenido editorial con la Local API de Payload (ver apps/web/CLAUDE.md).
// Todo lo público se lee con `overrideAccess: false` (solo lo publicado) y se cachea con el
// tag del blog; en draft mode se lee sin caché e incluye borradores.

const CACHE_OPTIONS = { tags: [BLOG_CACHE_TAG], revalidate: BLOG_REVALIDATE_SECONDS };

const PUBLISHED: Where = { _status: { equals: 'published' } };

/**
 * Topes de las lecturas que traen "todo" (sitemap, categorías): con `pagination: false` y sin
 * `limit`, Payload trae la tabla entera. Sobran para el blog de Norde.
 */
export const MAX_POST_SLUGS = 5000;
export const MAX_CATEGORIES = 200;

export interface PostCardData {
  readonly id: number;
  readonly title: string;
  readonly slug: string;
  readonly publishedAt: string | null;
  /** Meta description: también es el resumen de las tarjetas. */
  readonly description: string | null;
  readonly heroImage: Media | null;
  readonly categories: Category[];
}

export interface PostListPage {
  readonly posts: PostCardData[];
  readonly totalPosts: number;
  readonly totalPages: number;
}

export interface Author {
  readonly id: number;
  readonly name: string;
  readonly role: string | null;
  readonly bio: string | null;
  readonly photo: Media | null;
}

const payload = () => getPayload({ config });

const asMedia = (value: number | Media | null | undefined): Media | null =>
  value !== null && typeof value === 'object' ? value : null;

const asObjects = <T extends object>(values: readonly (number | T)[] | null | undefined): T[] =>
  (values ?? []).filter((v): v is T => typeof v === 'object');

function toCard(
  post: Pick<Post, 'id' | 'title' | 'slug' | 'publishedAt' | 'meta' | 'heroImage' | 'categories'>,
): PostCardData {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    publishedAt: post.publishedAt ?? null,
    description: post.meta?.description ?? null,
    heroImage: asMedia(post.heroImage),
    categories: asObjects(post.categories),
  };
}

const CARD_SELECT = {
  title: true,
  slug: true,
  heroImage: true,
  publishedAt: true,
  categories: true,
  meta: true,
} as const;

export const listPublishedPosts = unstable_cache(
  async (page: number, categoryId?: number): Promise<PostListPage> => {
    const result = await (
      await payload()
    ).find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 1,
      page,
      limit: POSTS_PER_PAGE,
      sort: '-publishedAt',
      select: CARD_SELECT,
      where: categoryId
        ? { and: [PUBLISHED, { categories: { contains: categoryId } }] }
        : PUBLISHED,
    });
    return {
      posts: result.docs.map(toCard),
      totalPosts: result.totalDocs,
      totalPages: result.totalPages,
    };
  },
  ['blog:list-published-posts'],
  CACHE_OPTIONS,
);

export const latestPosts = unstable_cache(
  async (limit: number): Promise<PostCardData[]> => {
    const result = await (
      await payload()
    ).find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 1,
      limit,
      pagination: false,
      sort: '-publishedAt',
      select: CARD_SELECT,
      where: PUBLISHED,
    });
    return result.docs.map(toCard);
  },
  ['blog:latest-posts'],
  CACHE_OPTIONS,
);

/** Slugs y fechas de todos los posts publicados (sitemap y pre-generación). */
export const listPublishedPostSlugs = unstable_cache(
  async (): Promise<{ slug: string; updatedAt: string }[]> => {
    const result = await (
      await payload()
    ).find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 0,
      limit: MAX_POST_SLUGS,
      pagination: false,
      select: { slug: true, updatedAt: true },
      where: PUBLISHED,
    });
    return result.docs.map((doc) => ({ slug: doc.slug, updatedAt: doc.updatedAt }));
  },
  ['blog:post-slugs'],
  CACHE_OPTIONS,
);

const cachedPublishedPost = unstable_cache(
  async (slug: string): Promise<Post | null> => {
    const result = await (
      await payload()
    ).find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 2,
      limit: 1,
      pagination: false,
      where: { and: [PUBLISHED, { slug: { equals: slug } }] },
    });
    return result.docs[0] ?? null;
  },
  ['blog:post-by-slug'],
  CACHE_OPTIONS,
);

/**
 * Solo se busca (y se cachea) un slug que está publicado: con uno inventado, la lista de slugs
 * (una sola entrada en el caché) alcanza para responder 404 sin llenar el caché.
 */
async function findPublishedPost(slug: string): Promise<Post | null> {
  const published = await listPublishedPostSlugs();
  return published.some((post) => post.slug === slug) ? cachedPublishedPost(slug) : null;
}

/**
 * Post por slug. En draft mode (preview del admin, con sesión verificada en /next/preview)
 * trae la última versión, aunque sea un borrador.
 */
export const findPostBySlug = cache(async (slug: string, draft: boolean): Promise<Post | null> => {
  if (!draft) return findPublishedPost(slug);

  const result = await (
    await payload()
  ).find({
    collection: 'posts',
    overrideAccess: true,
    draft: true,
    depth: 2,
    limit: 1,
    pagination: false,
    where: { slug: { equals: slug } },
  });
  return result.docs[0] ?? null;
});

/**
 * Autores públicos del post. Los usuarios no son legibles por el público (tienen email),
 * así que se leen con `overrideAccess` y seleccionando solo los campos públicos.
 */
export const findAuthors = unstable_cache(
  async (ids: readonly number[]): Promise<Author[]> => {
    if (ids.length === 0) return [];
    const result = await (
      await payload()
    ).find({
      collection: 'users',
      overrideAccess: true,
      depth: 1,
      limit: ids.length,
      pagination: false,
      select: { name: true, role: true, bio: true, photo: true },
      where: { id: { in: [...ids] } },
    });
    const byId = new Map(result.docs.map((user) => [user.id, user]));
    return ids.flatMap((id) => {
      const user = byId.get(id);
      if (!user) return [];
      return [
        {
          id: user.id,
          name: user.name,
          role: user.role ?? null,
          bio: user.bio ?? null,
          photo: asMedia(user.photo),
        },
      ];
    });
  },
  ['blog:authors'],
  CACHE_OPTIONS,
);

export const listCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const result = await (
      await payload()
    ).find({
      collection: 'categories',
      overrideAccess: false,
      depth: 0,
      limit: MAX_CATEGORIES,
      pagination: false,
      sort: 'title',
    });
    return result.docs;
  },
  ['blog:categories'],
  CACHE_OPTIONS,
);

export const findCategoryBySlug = cache(
  async (slug: string): Promise<Category | null> =>
    (await listCategories()).find((category) => category.slug === slug) ?? null,
);

/** Tope de redirecciones que se leen: se cargan a mano en el admin, son pocas. */
const MAX_REDIRECTS = 1000;

/** Las rutas de origen de las redirecciones: una sola entrada en el caché. */
const listRedirectSources = unstable_cache(
  async (): Promise<string[]> => {
    const result = await (
      await payload()
    ).find({
      collection: 'redirects',
      overrideAccess: false,
      depth: 0,
      limit: MAX_REDIRECTS,
      select: { from: true },
    });
    return result.docs.map((doc) => doc.from);
  },
  ['blog:redirect-sources'],
  CACHE_OPTIONS,
);

const cachedRedirect = unstable_cache(
  async (from: string): Promise<Redirect | null> => {
    const result = await (
      await payload()
    ).find({
      collection: 'redirects',
      overrideAccess: false,
      depth: 1,
      limit: 1,
      pagination: false,
      where: { from: { equals: from } },
    });
    return result.docs[0] ?? null;
  },
  ['blog:redirect'],
  CACHE_OPTIONS,
);

/**
 * Redirección cargada en el admin para una ruta (ej. un post cuyo slug cambió). Solo se busca (y
 * se cachea) una ruta que es origen de alguna: una URL inventada no llena el caché.
 */
export async function findRedirect(from: string): Promise<Redirect | null> {
  const sources = await listRedirectSources();
  return sources.includes(from) ? cachedRedirect(from) : null;
}
