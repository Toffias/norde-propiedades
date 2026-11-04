import {
  SearchSubscription,
  WEB_FOLLOW_UP_FREQUENCIES,
  type SearchSubscriptionRepository,
} from '@norde/core/clients';
import { Email, parseId } from '@norde/core/shared';
import { and, count, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { searchSubscriptions } from '../db/schema';

const Frequency = z.enum(WEB_FOLLOW_UP_FREQUENCIES);

function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

function storedContact(row: typeof searchSubscriptions.$inferSelect) {
  if (row.name === null || row.email === null) return undefined;
  const email = Email.create(row.email);
  if (email.isErr()) throw new Error(`Invalid email stored in search subscription ${row.id}`);
  return { name: row.name, email: email.value };
}

function toDomain(row: typeof searchSubscriptions.$inferSelect): SearchSubscription {
  return SearchSubscription.restore({
    id: storedId<'SearchSubscription'>(row.id),
    tokenHash: row.tokenHash,
    contact: storedContact(row),
    criteria: {
      operation: row.operation,
      propertyTypes: row.propertyTypes,
      currency: row.currency ?? undefined,
      minPriceCents: row.minPriceCents ?? undefined,
      maxPriceCents: row.maxPriceCents ?? undefined,
      locationIds: row.locationIds,
      minRooms: row.minRooms ?? undefined,
    },
    summary: row.summary,
    frequency: Frequency.parse(row.frequency),
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    confirmedAt: row.confirmedAt ?? undefined,
    clientId: row.clientId === null ? undefined : storedId<'Client'>(row.clientId),
    savedSearchId:
      row.savedSearchId === null ? undefined : storedId<'SavedSearch'>(row.savedSearchId),
  });
}

/** Las suscripciones a búsquedas desde la web (`search_subscriptions`, #208). */
export class DrizzleSearchSubscriptionRepository implements SearchSubscriptionRepository {
  constructor(private readonly db: DbExecutor) {}

  async findByTokenHash(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(searchSubscriptions)
      .where(eq(searchSubscriptions.tokenHash, tokenHash))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }

  /** Usa `search_subscriptions_email_requested_idx`. */
  async countRequestedSince(email: Email, since: Date) {
    const [row] = await this.db
      .select({ total: count() })
      .from(searchSubscriptions)
      .where(
        and(
          eq(searchSubscriptions.email, email.value),
          gte(searchSubscriptions.requestedAt, since),
        ),
      );
    return row?.total ?? 0;
  }

  async save(subscription: SearchSubscription, actorId: string): Promise<void> {
    const s = subscription.toSnapshot();
    const values = {
      name: s.contact?.name ?? null,
      email: s.contact?.email.value ?? null,
      confirmedAt: s.confirmedAt ?? null,
      clientId: s.clientId ?? null,
      savedSearchId: s.savedSearchId ?? null,
      updatedAt: s.confirmedAt ?? s.requestedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(searchSubscriptions)
      .values({
        ...values,
        id: s.id,
        tokenHash: s.tokenHash,
        summary: s.summary,
        frequency: s.frequency,
        operation: s.criteria.operation,
        propertyTypes: [...s.criteria.propertyTypes],
        currency: s.criteria.currency ?? null,
        minPriceCents: s.criteria.minPriceCents ?? null,
        maxPriceCents: s.criteria.maxPriceCents ?? null,
        locationIds: [...s.criteria.locationIds],
        minRooms: s.criteria.minRooms ?? null,
        requestedAt: s.requestedAt,
        expiresAt: s.expiresAt,
        createdAt: s.requestedAt,
        createdBy: actorId,
      })
      .onConflictDoUpdate({ target: searchSubscriptions.id, set: values });
  }

  /** Usa `search_subscriptions_pending_expires_idx`. */
  async deleteExpired(before: Date, limit: number): Promise<number> {
    const expired = this.db
      .select({ id: searchSubscriptions.id })
      .from(searchSubscriptions)
      .where(
        and(isNull(searchSubscriptions.confirmedAt), lt(searchSubscriptions.expiresAt, before)),
      )
      .limit(limit);
    const deleted = await this.db
      .delete(searchSubscriptions)
      .where(inArray(searchSubscriptions.id, expired))
      .returning({ id: searchSubscriptions.id });
    return deleted.length;
  }
}
