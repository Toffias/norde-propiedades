import type { FavoriteEntityValue } from '../../contracts';

/** Favoritos de cada usuario (`user_favorites`): filas de vínculo, sin aggregate. */
export interface UserFavorites {
  /** Cuáles de estos IDs ya son favoritos del usuario. */
  existing(
    userId: string,
    entityType: FavoriteEntityValue,
    ids: readonly string[],
  ): Promise<readonly string[]>;
  add(
    userId: string,
    entityType: FavoriteEntityValue,
    ids: readonly string[],
    now: Date,
  ): Promise<void>;
  remove(userId: string, entityType: FavoriteEntityValue, ids: readonly string[]): Promise<void>;
}

/** Lectura de favoritos fuera de una transacción (marcar las estrellas de una página). */
export type FavoriteQuery = Pick<UserFavorites, 'existing'>;
