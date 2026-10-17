import {
  LISTING_INTENTS,
  LISTING_OPERATIONS,
  LISTING_STATUSES,
  LISTING_TYPES,
  Listing,
  PORTALS,
  type ListingId,
  type ListingOperation,
  type ListingOwner,
  type ListingRepository,
  type PortalId,
} from '@norde/core/portals';
import { parseId, type Clock } from '@norde/core/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { portalListings } from '../db/schema';

const ListingRowSchema = z.object({
  portal: z.enum(PORTALS),
  operation: z.enum(LISTING_OPERATIONS).nullable(),
  listingType: z.enum(LISTING_TYPES),
  status: z.enum(LISTING_STATUSES),
  intent: z.enum(LISTING_INTENTS),
});

/** Tope de publicaciones de una propiedad: una por portal y operación (o una por portal). */
const MAX_LISTINGS_PER_PROPERTY = PORTALS.length * LISTING_OPERATIONS.length;

/** La propiedad o el emprendimiento de la fila (`portal_listings_single_owner`: uno de los dos). */
function ownerOf(row: typeof portalListings.$inferSelect): ListingOwner | undefined {
  if (row.propertyId !== null) return { kind: 'property', id: row.propertyId };
  if (row.developmentId !== null) return { kind: 'development', id: row.developmentId };
  return undefined;
}

function toListing(row: typeof portalListings.$inferSelect): Listing {
  const id = parseId<'Listing'>(row.id);
  const owner = ownerOf(row);
  if (id.isErr() || owner === undefined) {
    throw new Error(`Invalid listing stored in the database: ${row.id}`);
  }
  const values = ListingRowSchema.parse(row);
  return Listing.restore({
    id: id.value,
    portal: values.portal,
    owner,
    operation: values.operation ?? undefined,
    listingType: values.listingType,
    plan: row.plan ?? undefined,
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

/** Publicaciones de propiedades y emprendimientos en portales (`portal_listings`). */
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
    owner: ListingOwner,
    operation: ListingOperation | undefined,
  ): Promise<Listing | undefined> {
    const [row] = await this.db
      .select()
      .from(portalListings)
      .where(
        and(
          eq(portalListings.portal, portal),
          owner.kind === 'property'
            ? eq(portalListings.propertyId, owner.id)
            : eq(portalListings.developmentId, owner.id),
          operation === undefined
            ? isNull(portalListings.operation)
            : eq(portalListings.operation, operation),
        ),
      )
      .limit(1);
    return row && toListing(row);
  }

  async findByExternalIds(
    portal: PortalId,
    externalIds: readonly string[],
  ): Promise<readonly Listing[]> {
    if (externalIds.length === 0) return [];
    // `portal_listings_portal_external_uq`: como mucho una por ID.
    const rows = await this.db
      .select()
      .from(portalListings)
      .where(
        and(
          eq(portalListings.portal, portal),
          inArray(portalListings.externalId, [...externalIds]),
        ),
      )
      .limit(externalIds.length);
    return rows.map(toListing);
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

  async findForDevelopment(developmentId: string): Promise<readonly Listing[]> {
    // `portal_listings_portal_development_uq`: como mucho una por portal.
    const rows = await this.db
      .select()
      .from(portalListings)
      .where(eq(portalListings.developmentId, developmentId))
      .orderBy(asc(portalListings.portal), asc(portalListings.createdAt), asc(portalListings.id))
      .limit(PORTALS.length);
    return rows.map(toListing);
  }

  async save(listing: Listing, actorId: string): Promise<void> {
    const s = listing.toSnapshot();
    const now = this.clock.now();
    const values = {
      listingType: s.listingType,
      plan: s.plan ?? null,
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
        propertyId: s.owner.kind === 'property' ? s.owner.id : null,
        developmentId: s.owner.kind === 'development' ? s.owner.id : null,
        operation: s.operation ?? null,
        ...values,
        createdAt: s.createdAt,
        createdBy: actorId,
      })
      .onConflictDoUpdate({ target: portalListings.id, set: values });
  }
}
