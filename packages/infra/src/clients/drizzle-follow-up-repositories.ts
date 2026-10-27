import type {
  FollowUpCandidatesQuery,
  FollowUpFeaturedCandidate,
  FollowUpMatch,
  FollowUpMatchRepository,
  FollowUpSearchCandidate,
} from '@norde/core/clients';
import { and, asc, eq, isNull, lte } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { clients, featuredListings, followUpMatches, savedSearches } from '../db/schema';

import { matchingSavedSearches } from './saved-search-matching';

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
