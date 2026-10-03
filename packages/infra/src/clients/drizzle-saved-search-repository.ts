import {
  SavedSearch,
  type ClientId,
  type SavedSearchId,
  type SavedSearchRepository,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { savedSearches } from '../db/schema';

const ExtraCriteria = z.record(z.string(), z.unknown()).catch({});

function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

function toDomain(row: typeof savedSearches.$inferSelect): SavedSearch {
  return SavedSearch.restore({
    id: storedId<'SavedSearch'>(row.id),
    clientId: storedId<'Client'>(row.clientId),
    name: row.name ?? undefined,
    opportunityId: row.opportunityId ?? undefined,
    operation: row.operation,
    propertyTypes: row.propertyTypes,
    currency: row.currency ?? undefined,
    minPriceCents: row.minPriceCents ?? undefined,
    maxPriceCents: row.maxPriceCents ?? undefined,
    locationIds: row.locationIds,
    minRooms: row.minRooms ?? undefined,
    autoSend: row.autoSend,
    extraCriteria: ExtraCriteria.parse(row.criteria),
    unsubscribedAt: row.unsubscribedAt ?? undefined,
    lastMatchedAt: row.lastMatchedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
    deletedBy: row.deletedBy ?? undefined,
  });
}

/** Las búsquedas guardadas (`saved_searches`). Las vigentes usan `saved_searches_client_updated_idx`. */
export class DrizzleSavedSearchRepository implements SavedSearchRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: SavedSearchId) {
    const [row] = await this.db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.id, id))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  async findActiveByClient(clientId: ClientId, limit: number) {
    const rows = await this.db
      .select()
      .from(savedSearches)
      .where(and(eq(savedSearches.clientId, clientId), isNull(savedSearches.deletedAt)))
      .orderBy(desc(savedSearches.updatedAt), desc(savedSearches.id))
      .limit(limit);
    return rows.map(toDomain);
  }

  async countActiveByClient(clientId: ClientId) {
    const [row] = await this.db
      .select({ total: count() })
      .from(savedSearches)
      .where(and(eq(savedSearches.clientId, clientId), isNull(savedSearches.deletedAt)));
    return row?.total ?? 0;
  }

  async save(search: SavedSearch, actorId: string): Promise<void> {
    const s = search.toSnapshot();
    const values = {
      name: s.name ?? null,
      opportunityId: s.opportunityId ?? null,
      operation: s.operation,
      propertyTypes: [...s.propertyTypes],
      currency: s.currency ?? null,
      minPriceCents: s.minPriceCents ?? null,
      maxPriceCents: s.maxPriceCents ?? null,
      locationIds: [...s.locationIds],
      minRooms: s.minRooms ?? null,
      autoSend: s.autoSend,
      criteria: s.extraCriteria,
      unsubscribedAt: s.unsubscribedAt ?? null,
      lastMatchedAt: s.lastMatchedAt ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
      deletedAt: s.deletedAt ?? null,
      deletedBy: s.deletedBy ?? null,
    };
    await this.db
      .insert(savedSearches)
      .values({
        ...values,
        id: s.id,
        clientId: s.clientId,
        createdAt: s.createdAt,
        createdBy: actorId,
      })
      .onConflictDoUpdate({ target: savedSearches.id, set: values });
  }
}
