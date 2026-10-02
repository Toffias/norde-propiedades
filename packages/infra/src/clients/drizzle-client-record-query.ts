import {
  OPPORTUNITY_STATUSES,
  type ClientActiveOpportunity,
  type ClientActivityItem,
  type ClientFeaturedItem,
  type ClientOpportunityItem,
  type ClientRecordQuery,
  type ClientSavedSearchRow,
  type ClientTabCounts,
  type OpportunityStatusValue,
} from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  clientActivities,
  clientRelations,
  clients,
  featuredListings,
  opportunities,
  savedSearches,
} from '../db/schema';

import { storedActivityBody } from './drizzle-client-activity-repositories';

const Status = z.enum(OPPORTUNITY_STATUSES);
const Reaction = z.enum(['liked', 'disliked']).nullable();
const CountRow = z.object({ total: z.coerce.number() });

type Criteria<K extends keyof ClientRecordQuery> = Parameters<ClientRecordQuery[K]>[0];

function direction(dir: 'asc' | 'desc') {
  return dir === 'asc' ? asc : desc;
}

async function total(query: Promise<{ total: number }[]>): Promise<number> {
  return (await query)[0]?.total ?? 0;
}

/**
 * Las pestañas de la ficha del contacto, paginadas en la base. Cada listado recorre su índice por
 * `client_id` en el orden que se pide, con el ID como desempate.
 */
export class DrizzleClientRecordQuery implements ClientRecordQuery {
  constructor(private readonly db: DbExecutor) {}

  async activity(criteria: Criteria<'activity'>): Promise<PageSlice<ClientActivityItem>> {
    const order = direction(criteria.direction);
    const where = and(
      eq(clientActivities.clientId, criteria.clientId),
      criteria.kind === undefined ? undefined : eq(clientActivities.kind, criteria.kind),
    );
    const [rows, count_] = await Promise.all([
      this.db
        .select()
        .from(clientActivities)
        .where(where)
        .orderBy(order(clientActivities.occurredAt), order(clientActivities.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      total(this.db.select({ total: count() }).from(clientActivities).where(where)),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        opportunityId: row.opportunityId ?? undefined,
        actorId: row.actorId,
        body: storedActivityBody(row.kind, row.body),
        occurredAt: row.occurredAt,
      })),
      total: count_,
    };
  }

  async opportunities(
    criteria: Criteria<'opportunities'>,
  ): Promise<PageSlice<ClientOpportunityItem>> {
    const order = direction(criteria.direction);
    const where = eq(opportunities.clientId, criteria.clientId);
    const [rows, count_] = await Promise.all([
      this.db
        .select()
        .from(opportunities)
        .where(where)
        .orderBy(order(opportunities.createdAt), order(opportunities.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      total(this.db.select({ total: count() }).from(opportunities).where(where)),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        intent: row.intent,
        status: Status.parse(row.status),
        originChannel: row.originChannel,
        propertyId: row.propertyId ?? undefined,
        agentId: row.agentId ?? undefined,
        createdAt: row.createdAt,
        statusChangedAt: row.statusChangedAt ?? undefined,
        closedAt: row.closedAt ?? undefined,
      })),
      total: count_,
    };
  }

  async activeOpportunity(
    clientId: string,
    openStatuses: readonly OpportunityStatusValue[],
  ): Promise<ClientActiveOpportunity | undefined> {
    if (openStatuses.length === 0) return undefined;
    const where = and(
      eq(opportunities.clientId, clientId),
      inArray(opportunities.status, [...openStatuses]),
    );
    const [rows, openCount] = await Promise.all([
      this.db
        .select({
          id: opportunities.id,
          type: opportunities.type,
          status: opportunities.status,
          createdAt: opportunities.createdAt,
        })
        .from(opportunities)
        .where(where)
        .orderBy(desc(opportunities.createdAt), desc(opportunities.id))
        .limit(1),
      total(this.db.select({ total: count() }).from(opportunities).where(where)),
    ]);
    const [row] = rows;
    return (
      row && {
        id: row.id,
        type: row.type,
        status: Status.parse(row.status),
        createdAt: row.createdAt,
        openCount,
      }
    );
  }

  async featured(criteria: Criteria<'featured'>): Promise<PageSlice<ClientFeaturedItem>> {
    const order = direction(criteria.direction);
    const where = and(
      eq(featuredListings.clientId, criteria.clientId),
      isNull(featuredListings.removedAt),
    );
    const [rows, count_] = await Promise.all([
      this.db
        .select()
        .from(featuredListings)
        .where(where)
        .orderBy(order(featuredListings.featuredAt), order(featuredListings.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      total(this.db.select({ total: count() }).from(featuredListings).where(where)),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        propertyId: row.propertyId,
        matchScore: row.matchScore ?? undefined,
        reaction: Reaction.parse(row.reaction) ?? undefined,
        featuredBy: row.featuredBy,
        featuredAt: row.featuredAt,
      })),
      total: count_,
    };
  }

  async featuredPropertyIds(
    clientId: string,
    propertyIds: readonly string[],
  ): Promise<readonly string[]> {
    if (propertyIds.length === 0) return [];
    const rows = await this.db
      .select({ propertyId: featuredListings.propertyId })
      .from(featuredListings)
      .where(
        and(
          eq(featuredListings.clientId, clientId),
          inArray(featuredListings.propertyId, [...propertyIds]),
          isNull(featuredListings.removedAt),
        ),
      );
    return rows.map((row) => row.propertyId);
  }

  async savedSearches(
    criteria: Criteria<'savedSearches'>,
  ): Promise<PageSlice<ClientSavedSearchRow>> {
    const order = direction(criteria.direction);
    const where = and(
      eq(savedSearches.clientId, criteria.clientId),
      isNull(savedSearches.deletedAt),
    );
    const [rows, count_] = await Promise.all([
      this.db
        .select()
        .from(savedSearches)
        .where(where)
        .orderBy(order(savedSearches.updatedAt), order(savedSearches.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      total(this.db.select({ total: count() }).from(savedSearches).where(where)),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name ?? undefined,
        operation: row.operation,
        propertyTypes: row.propertyTypes,
        currency: row.currency ?? undefined,
        minPriceCents: row.minPriceCents ?? undefined,
        maxPriceCents: row.maxPriceCents ?? undefined,
        locationCount: row.locationIds.length,
        minRooms: row.minRooms ?? undefined,
        autoSend: row.autoSend,
        unsubscribed: row.unsubscribedAt !== null,
        lastMatchedAt: row.lastMatchedAt ?? undefined,
        updatedAt: row.updatedAt,
      })),
      total: count_,
    };
  }

  async tabCounts(clientId: string): Promise<ClientTabCounts> {
    const countOf = async (query: SQL) =>
      CountRow.parse((await this.db.execute(query)).rows[0] ?? { total: 0 }).total;
    // Las relaciones, en los dos sentidos y sin los contactos de la papelera (como la sección).
    const relations = sql`
      select count(*) as total from (
        select r.related_client_id as other_id from ${clientRelations} r
        where r.client_id = ${clientId}
        union all
        select r.client_id as other_id from ${clientRelations} r
        where r.related_client_id = ${clientId}
      ) rel
      join ${clients} c on c.id = rel.other_id and c.deleted_at is null
    `;
    const [activity, opportunityCount, featured, searches, relationCount] = await Promise.all([
      total(
        this.db
          .select({ total: count() })
          .from(clientActivities)
          .where(eq(clientActivities.clientId, clientId)),
      ),
      total(
        this.db
          .select({ total: count() })
          .from(opportunities)
          .where(eq(opportunities.clientId, clientId)),
      ),
      total(
        this.db
          .select({ total: count() })
          .from(featuredListings)
          .where(and(eq(featuredListings.clientId, clientId), isNull(featuredListings.removedAt))),
      ),
      total(
        this.db
          .select({ total: count() })
          .from(savedSearches)
          .where(and(eq(savedSearches.clientId, clientId), isNull(savedSearches.deletedAt))),
      ),
      countOf(relations),
    ]);
    return {
      activity,
      opportunities: opportunityCount,
      featured,
      savedSearches: searches,
      relations: relationCount,
    };
  }
}
