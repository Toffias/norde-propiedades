import {
  LISTING_INTENTS,
  LISTING_OPERATIONS,
  LISTING_STATUSES,
  LISTING_TYPES,
  Listing,
  PORTALS,
  type ListingId,
  type ListingOperation,
  type ListingRepository,
  type PortalId,
} from '@norde/core/portals';
import { parseId, type Clock } from '@norde/core/shared';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { portalListings } from '../db/schema';

const ListingRowSchema = z.object({
  portal: z.enum(PORTALS),
  operation: z.enum(LISTING_OPERATIONS),
  listingType: z.enum(LISTING_TYPES),
  status: z.enum(LISTING_STATUSES),
  intent: z.enum(LISTING_INTENTS),
});

/** Tope de publicaciones de una propiedad: una por portal y operación. */
const MAX_LISTINGS_PER_PROPERTY = PORTALS.length * LISTING_OPERATIONS.length;

function toListing(row: typeof portalListings.$inferSelect): Listing {
  const id = parseId<'Listing'>(row.id);
  // Este repositorio solo maneja publicaciones de propiedades (las de emprendimientos llegan después).
  if (id.isErr() || row.propertyId === null) {
    throw new Error(`Invalid property listing stored in the database: ${row.id}`);
  }
  const values = ListingRowSchema.parse(row);
  return Listing.restore({
    id: id.value,
    portal: values.portal,
    propertyId: row.propertyId,
    operation: values.operation,
    listingType: values.listingType,
    status: values.status,
    intent: values.intent,
    externalId: row.externalId ?? undefined,
    permalink: row.permalink ?? undefined,
    lastError: row.lastError ?? undefined,
    retryCount: row.retryCount,
    lastSyncedAt: row.lastSyncedAt ?? undefined,
    publishedAt: row.publishedAt ?? undefined,
    contentHash: row.contentHash ?? undefined,
    createdAt: row.createdAt,
  });
}

/** Publicaciones de propiedades en portales (`portal_listings`). */
export class DrizzleListingRepository implements ListingRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly clock: Clock,
  ) {}

  async findById(id: ListingId): Promise<Listing | undefined> {
    const [row] = await this.db
      .select()
      .from(portalListings)
      .where(eq(portalListings.id, id))
      .limit(1);
    return row && toListing(row);
  }

  async lockById(id: ListingId): Promise<Listing | undefined> {
    const [row] = await this.db
      .select()
      .from(portalListings)
      .where(eq(portalListings.id, id))
      .limit(1)
      .for('update');
    return row && toListing(row);
  }

  async findOne(
    portal: PortalId,
    propertyId: string,
    operation: ListingOperation,
  ): Promise<Listing | undefined> {
    const [row] = await this.db
      .select()
      .from(portalListings)
      .where(
        and(
          eq(portalListings.portal, portal),
          eq(portalListings.propertyId, propertyId),
          eq(portalListings.operation, operation),
        ),
      )
      .limit(1);
    return row && toListing(row);
  }

  async findForProperty(propertyId: string): Promise<readonly Listing[]> {
    const rows = await this.db
      .select()
      .from(portalListings)
      .where(eq(portalListings.propertyId, propertyId))
      .orderBy(asc(portalListings.portal), asc(portalListings.createdAt), asc(portalListings.id))
      .limit(MAX_LISTINGS_PER_PROPERTY);
    return rows.map(toListing);
  }

  async save(listing: Listing, actorId: string): Promise<void> {
    const s = listing.toSnapshot();
    const now = this.clock.now();
    const values = {
      listingType: s.listingType,
      status: s.status,
      intent: s.intent,
      externalId: s.externalId ?? null,
      permalink: s.permalink ?? null,
      lastError: s.lastError ?? null,
      retryCount: s.retryCount,
      lastSyncedAt: s.lastSyncedAt ?? null,
      publishedAt: s.publishedAt ?? null,
      contentHash: s.contentHash ?? null,
      updatedAt: now,
      updatedBy: actorId,
    };
    await this.db
      .insert(portalListings)
      .values({
        id: s.id,
        portal: s.portal,
        propertyId: s.propertyId,
        operation: s.operation,
        ...values,
        createdAt: s.createdAt,
        createdBy: actorId,
      })
      .onConflictDoUpdate({ target: portalListings.id, set: values });
  }
}
