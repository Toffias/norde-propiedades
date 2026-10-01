import {
  PROPERTY_REACTION_VALUES,
  PROPERTY_SEND_CHANNEL_VALUES,
  type InterestedClientRow,
  type PropertyInterestCriteria,
  type PropertyInterestQuery,
  type PropertySendRow,
  type PropertySendsCriteria,
} from '@norde/core/clients';
import type { PageSlice } from '@norde/core/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clients, savedSearches, sharedListingItems, sharedListings } from '../db/schema';

import { matchingSavedSearches, visibleClients } from './saved-search-matching';

const SendEnums = z.object({
  channel: z.enum(PROPERTY_SEND_CHANNEL_VALUES),
  reaction: z.enum(PROPERTY_REACTION_VALUES).nullable(),
});

/** Interesados (búsquedas guardadas que coinciden) y envíos de una propiedad, paginados en SQL. */
export class DrizzlePropertyInterestQuery implements PropertyInterestQuery {
  constructor(private readonly db: DbExecutor) {}

  async interested(
    criteria: PropertyInterestCriteria,
  ): Promise<
    PageSlice<Omit<InterestedClientRow, 'agent'> & { readonly agentId: string | undefined }>
  > {
    const where = and(matchingSavedSearches(criteria.profile), visibleClients(criteria.visibility));
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          clientId: clients.id,
          clientName: clients.name,
          savedSearchId: savedSearches.id,
          savedSearchName: savedSearches.name,
          operation: savedSearches.operation,
          agentId: clients.agentId,
          updatedAt: savedSearches.updatedAt,
        })
        .from(savedSearches)
        .innerJoin(clients, eq(clients.id, savedSearches.clientId))
        .where(where)
        .orderBy(desc(savedSearches.updatedAt), desc(savedSearches.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db
        .select({ total: count() })
        .from(savedSearches)
        .innerJoin(clients, eq(clients.id, savedSearches.clientId))
        .where(where),
    ]);
    return {
      items: rows.map((row) => ({
        ...row,
        clientName: row.clientName ?? undefined,
        savedSearchName: row.savedSearchName ?? undefined,
        agentId: row.agentId ?? undefined,
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  async sends(
    criteria: PropertySendsCriteria,
  ): Promise<PageSlice<Omit<PropertySendRow, 'sentBy'> & { readonly sentBy: string }>> {
    const where = and(
      eq(sharedListingItems.propertyId, criteria.propertyId),
      visibleClients(criteria.visibility),
    );
    const from = () =>
      this.db
        .select({
          sharedListingId: sharedListings.id,
          clientId: clients.id,
          clientName: clients.name,
          channel: sharedListings.channel,
          sentAt: sharedListings.sentAt,
          sentBy: sharedListings.sentBy,
          openCount: sharedListingItems.openCount,
          firstOpenedAt: sharedListingItems.firstOpenedAt,
          reaction: sharedListingItems.reaction,
        })
        .from(sharedListingItems)
        .innerJoin(sharedListings, eq(sharedListings.id, sharedListingItems.sharedListingId))
        .innerJoin(clients, eq(clients.id, sharedListings.clientId));
    const [rows, totals] = await Promise.all([
      from()
        .where(where)
        .orderBy(desc(sharedListings.sentAt), desc(sharedListings.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db
        .select({ total: count() })
        .from(sharedListingItems)
        .innerJoin(sharedListings, eq(sharedListings.id, sharedListingItems.sharedListingId))
        .innerJoin(clients, eq(clients.id, sharedListings.clientId))
        .where(where),
    ]);
    return {
      items: rows.map((row) => {
        const enums = SendEnums.parse(row);
        return {
          ...row,
          clientName: row.clientName ?? undefined,
          channel: enums.channel,
          reaction: enums.reaction ?? undefined,
          firstOpenedAt: row.firstOpenedAt ?? undefined,
        };
      }),
      total: totals[0]?.total ?? 0,
    };
  }
}
