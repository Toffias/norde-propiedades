import {
  LINKED_LISTING_STATUSES,
  PORTALS,
  type PortalListingCount,
  type PortalListingCounter,
} from '@norde/core/portals';
import { and, count, inArray, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { portalListings } from '../db/schema';

const CountRowSchema = z.object({
  portal: z.enum(PORTALS),
  ownerKind: z.enum(['property', 'development']),
  status: z.enum(LINKED_LISTING_STATUSES),
  count: z.number().int().nonnegative(),
});

/**
 * Las publicaciones vinculadas de cada portal, agrupadas por tipo de aviso y estado
 * (`portal_listings_portal_status_idx`). Como mucho portales × tipos × estados filas.
 */
export class DrizzlePortalListingCountsQuery implements PortalListingCounter {
  constructor(private readonly db: DbExecutor) {}

  async countLinked(): Promise<readonly PortalListingCount[]> {
    const ownerKind = sql<string>`case when ${portalListings.propertyId} is null then 'development' else 'property' end`;
    const rows = await this.db
      .select({
        portal: portalListings.portal,
        ownerKind,
        status: portalListings.status,
        count: count(),
      })
      .from(portalListings)
      .where(
        and(
          inArray(portalListings.status, [...LINKED_LISTING_STATUSES]),
          isNotNull(portalListings.externalId),
        ),
      )
      .groupBy(portalListings.portal, ownerKind, portalListings.status);
    return rows.map((row) => CountRowSchema.parse(row));
  }
}
