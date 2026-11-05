import { z } from 'zod';

import type { ListingCard } from '../properties/view';

// Los favoritos viven en el navegador del visitante (localStorage): no hay cuenta en el sitio. Se
// guarda lo justo para mostrarlos en el panel lateral sin pedirle nada al servidor.

/** Más favoritos no entran: es también el tope de consultas de un envío. */
export const MAX_FAVORITES = 20;

export const FAVORITES_STORAGE_KEY = 'norde:favorites:v1';

const FavoriteSchema = z.object({
  id: z.uuid(),
  href: z.string().startsWith('/').max(300),
  title: z.string().max(300),
  priceLabel: z.string().max(120),
  location: z.string().max(300),
  cover: z.object({ src: z.string().max(2000), alt: z.string().max(300) }).nullable(),
});

export type Favorite = z.infer<typeof FavoriteSchema>;

/** Lo que se guarda de una propiedad al marcarla. */
export function toFavorite(listing: ListingCard): Favorite {
  return {
    id: listing.id,
    href: listing.href,
    title: listing.title,
    priceLabel: listing.priceLabel,
    location: listing.address ? `${listing.address} · ${listing.location}` : listing.location,
    cover: listing.cover ? { src: listing.cover.src, alt: listing.cover.alt } : null,
  };
}

/**
 * Lee lo guardado. Lo que viene del navegador es dato externo: lo que no valida se descarta, sin
 * repetidos y hasta el máximo.
 */
export function parseFavorites(raw: string | null): readonly Favorite[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    // Un valor roto (editado a mano o de otra versión) equivale a no tener favoritos.
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const favorites: Favorite[] = [];
  for (const item of value) {
    const parsed = FavoriteSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    favorites.push(parsed.data);
    if (favorites.length === MAX_FAVORITES) break;
  }
  return favorites;
}

/** Agrega la propiedad (al principio) o la saca si ya estaba. Lleno, no agrega. */
export function toggleFavorite(
  favorites: readonly Favorite[],
  favorite: Favorite,
): readonly Favorite[] {
  if (favorites.some((item) => item.id === favorite.id)) {
    return favorites.filter((item) => item.id !== favorite.id);
  }
  if (favorites.length >= MAX_FAVORITES) return favorites;
  return [favorite, ...favorites];
}
