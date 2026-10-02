import type {
  ClientFavoriteErasure,
  FavoriteEntityValue,
  UserFavorites,
} from '@norde/core/identity';
import { and, eq, inArray } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { userFavorites } from '../db/schema';

/** Favoritos de cada usuario: filas de vínculo (PK usuario + tipo + ID). */
export class DrizzleUserFavorites implements UserFavorites {
  constructor(private readonly db: DbExecutor) {}

  async existing(
    userId: string,
    entityType: FavoriteEntityValue,
    ids: readonly string[],
  ): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ entityId: userFavorites.entityId })
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.entityType, entityType),
          inArray(userFavorites.entityId, [...ids]),
        ),
      )
      .limit(ids.length);
    return rows.map((row) => row.entityId);
  }

  async add(
    userId: string,
    entityType: FavoriteEntityValue,
    ids: readonly string[],
    now: Date,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .insert(userFavorites)
      .values(ids.map((entityId) => ({ userId, entityType, entityId, createdAt: now })))
      .onConflictDoNothing();
  }

  async remove(
    userId: string,
    entityType: FavoriteEntityValue,
    ids: readonly string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.entityType, entityType),
          inArray(userFavorites.entityId, [...ids]),
        ),
      );
  }
}

/** Supresión: los clientes suprimidos salen de los favoritos de todos los usuarios. */
export class DrizzleClientFavoriteErasure implements ClientFavoriteErasure {
  constructor(private readonly db: DbExecutor) {}

  async removeClients(clientIds: readonly string[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const removed = await this.db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.entityType, 'client'),
          inArray(userFavorites.entityId, [...clientIds]),
        ),
      )
      .returning({ userId: userFavorites.userId });
    return removed.length;
  }
}
