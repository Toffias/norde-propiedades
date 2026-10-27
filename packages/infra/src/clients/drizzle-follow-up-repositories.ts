import {
  FOLLOW_UP_REASONS,
  type ClientId,
  type FollowUpCandidatesQuery,
  type FollowUpFeaturedCandidate,
  type FollowUpMatch,
  type FollowUpMatchId,
  type FollowUpMatchRepository,
  type FollowUpReason,
  type FollowUpSearchCandidate,
  type FollowUpSource,
  type PendingFollowUpsQuery,
  type SharedListingId,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { clients, featuredListings, followUpMatches, savedSearches } from '../db/schema';

import { matchingSavedSearches } from './saved-search-matching';

/** Sin mandar ni descartar: lo que cubre el índice parcial `follow_up_matches_pending_idx`. */
const isPending = and(isNull(followUpMatches.sentAt), isNull(followUpMatches.discardedAt));

/**
 * Pendiente y con su fuente: si la búsqueda o la destacada se borró físicamente (`set null`), ya no
 * hay a quién avisarle y no se ofrece.
 */
const isDeliverable = and(
  isPending,
  or(isNotNull(followUpMatches.savedSearchId), isNotNull(followUpMatches.featuredListingId)),
);

function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

function isReason(value: string): value is FollowUpReason {
  return FOLLOW_UP_REASONS.some((reason) => reason === value);
}

/** Una fila como coincidencia; sin fuente o con un motivo desconocido, no hay qué mandar. */
function toMatch(row: typeof followUpMatches.$inferSelect): FollowUpMatch | undefined {
  const source: FollowUpSource | undefined =
    row.savedSearchId !== null
      ? { kind: 'saved_search', savedSearchId: storedId<'SavedSearch'>(row.savedSearchId) }
      : row.featuredListingId !== null
        ? {
            kind: 'featured',
            featuredListingId: storedId<'FeaturedListing'>(row.featuredListingId),
          }
        : undefined;
  if (source === undefined || !isReason(row.reason)) return undefined;
  return {
    id: storedId<'FollowUpMatch'>(row.id),
    clientId: storedId<'Client'>(row.clientId),
    propertyId: row.propertyId,
    reason: row.reason,
    source,
    price: {
      operation: row.operation,
      currency: row.currency,
      priceCents: row.priceCents ?? undefined,
    },
    detectedAt: row.detectedAt,
  };
}

/** Las coincidencias del cruce con el stock (#106): la repetida la descartan los índices únicos. */
export class DrizzleFollowUpMatchRepository implements FollowUpMatchRepository {
  constructor(private readonly db: DbExecutor) {}

  async add(match: FollowUpMatch, actorId: string): Promise<boolean> {
    const inserted = await this.db
      .insert(followUpMatches)
      .values({
        id: match.id,
        clientId: match.clientId,
        propertyId: match.propertyId,
        reason: match.reason,
        savedSearchId: match.source.kind === 'saved_search' ? match.source.savedSearchId : null,
        featuredListingId: match.source.kind === 'featured' ? match.source.featuredListingId : null,
        operation: match.price.operation,
        currency: match.price.currency,
        priceCents: match.price.priceCents ?? null,
        detectedAt: match.detectedAt,
        createdAt: match.detectedAt,
        updatedAt: match.detectedAt,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .onConflictDoNothing()
      .returning({ id: followUpMatches.id });
    return inserted.length > 0;
  }

  async findPending(clientId: ClientId, limit: number): Promise<FollowUpMatch[]> {
    const rows = await this.db
      .select()
      .from(followUpMatches)
      .where(and(eq(followUpMatches.clientId, clientId), isDeliverable))
      .orderBy(asc(followUpMatches.detectedAt), asc(followUpMatches.id))
      .limit(limit);
    return rows.flatMap((row) => toMatch(row) ?? []);
  }

  async markSent(
    ids: readonly FollowUpMatchId[],
    sharedListingId: SharedListingId,
    now: Date,
    actorId: string,
  ): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(followUpMatches)
      .set({ sentAt: now, sharedListingId, updatedAt: now, updatedBy: actorId })
      .where(and(inArray(followUpMatches.id, [...ids]), isPending));
  }

  async discard(ids: readonly FollowUpMatchId[], now: Date, actorId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(followUpMatches)
      .set({ discardedAt: now, updatedAt: now, updatedBy: actorId })
      .where(and(inArray(followUpMatches.id, [...ids]), isPending));
  }
}

/** Los contactos con coincidencias pendientes, por el índice parcial de las pendientes. */
export class DrizzlePendingFollowUpsQuery implements PendingFollowUpsQuery {
  constructor(private readonly db: DbExecutor) {}

  async clients(criteria: Parameters<PendingFollowUpsQuery['clients']>[0]): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ clientId: followUpMatches.clientId })
      .from(followUpMatches)
      .where(
        and(
          isDeliverable,
          criteria.after === undefined ? undefined : gt(followUpMatches.clientId, criteria.after),
        ),
      )
      .orderBy(asc(followUpMatches.clientId))
      .limit(criteria.limit);
    return rows.map((row) => row.clientId);
  }
}

/**
 * A quién le interesa una propiedad para los seguimientos automáticos: búsquedas y destacadas con
 * envío automático de contactos activos, de a páginas por ID.
 */
export class DrizzleFollowUpCandidatesQuery implements FollowUpCandidatesQuery {
  constructor(private readonly db: DbExecutor) {}

  searches(
    criteria: Parameters<FollowUpCandidatesQuery['searches']>[0],
  ): Promise<FollowUpSearchCandidate[]> {
    return this.db
      .select({
        savedSearchId: savedSearches.id,
        clientId: savedSearches.clientId,
        operation: savedSearches.operation,
      })
      .from(savedSearches)
      .innerJoin(clients, eq(clients.id, savedSearches.clientId))
      .where(
        and(
          eq(savedSearches.autoSend, true),
          matchingSavedSearches(criteria.profile),
          criteria.operation === undefined
            ? undefined
            : eq(savedSearches.operation, criteria.operation),
          criteria.savedUntil === undefined
            ? undefined
            : lte(savedSearches.createdAt, criteria.savedUntil),
        ),
      )
      .orderBy(asc(savedSearches.id))
      .offset(criteria.offset)
      .limit(criteria.limit);
  }

  featured(
    criteria: Parameters<FollowUpCandidatesQuery['featured']>[0],
  ): Promise<FollowUpFeaturedCandidate[]> {
    return this.db
      .select({ featuredListingId: featuredListings.id, clientId: featuredListings.clientId })
      .from(featuredListings)
      .innerJoin(clients, eq(clients.id, featuredListings.clientId))
      .where(
        and(
          eq(featuredListings.propertyId, criteria.propertyId),
          eq(featuredListings.autoSendUpdates, true),
          isNull(featuredListings.removedAt),
          isNull(clients.deletedAt),
        ),
      )
      .orderBy(asc(featuredListings.id))
      .offset(criteria.offset)
      .limit(criteria.limit);
  }
}
