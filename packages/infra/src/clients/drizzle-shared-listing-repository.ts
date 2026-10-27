import {
  LISTING_REACTIONS,
  SHARED_LISTING_CHANNELS,
  SharedListing,
  type SharedListingId,
  type SharedListingRepository,
} from '@norde/core/clients';
import { parseId } from '@norde/core/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { sharedListingItems, sharedListings } from '../db/schema';

const Channel = z.enum(SHARED_LISTING_CHANNELS);
const Reaction = z.enum(LISTING_REACTIONS);

function storedId<TBrand extends string>(value: string) {
  const id = parseId<TBrand>(value);
  if (id.isErr()) throw new Error(`Invalid id stored in the database: ${value}`);
  return id.value;
}

/** Los envíos por link: la fila del envío y una por propiedad, con sus aperturas y reacciones. */
export class DrizzleSharedListingRepository implements SharedListingRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: SharedListingId): Promise<SharedListing | undefined> {
    return this.load(eq(sharedListings.id, id));
  }

  async findByTokenHash(tokenHash: string): Promise<SharedListing | undefined> {
    return this.load(eq(sharedListings.tokenHash, tokenHash));
  }

  async save(listing: SharedListing, actorId: string): Promise<void> {
    const s = listing.toSnapshot();
    await this.db
      .insert(sharedListings)
      .values({
        id: s.id,
        tokenHash: s.tokenHash,
        clientId: s.clientId,
        opportunityId: s.opportunityId ?? null,
        channel: s.channel,
        sentBy: s.sentBy,
        sentAt: s.sentAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt ?? null,
        createdAt: s.sentAt,
        updatedAt: s.sentAt,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        target: sharedListings.id,
        set: { revokedAt: s.revokedAt ?? null, updatedAt: sql`now()`, updatedBy: actorId },
      });
    if (s.items.length === 0) return;
    await this.db
      .insert(sharedListingItems)
      .values(
        s.items.map((item) => ({
          sharedListingId: s.id,
          propertyId: item.propertyId,
          position: item.position,
          firstOpenedAt: item.firstOpenedAt ?? null,
          openCount: item.openCount,
          reaction: item.reaction ?? null,
          reactedAt: item.reactedAt ?? null,
          createdAt: s.sentAt,
          updatedAt: s.sentAt,
        })),
      )
      .onConflictDoUpdate({
        target: [sharedListingItems.sharedListingId, sharedListingItems.propertyId],
        set: {
          firstOpenedAt: sql`excluded.first_opened_at`,
          openCount: sql`excluded.open_count`,
          reaction: sql`excluded.reaction`,
          reactedAt: sql`excluded.reacted_at`,
          updatedAt: sql`now()`,
        },
      });
  }

  private async load(where: ReturnType<typeof eq>): Promise<SharedListing | undefined> {
    const [row] = await this.db.select().from(sharedListings).where(where).limit(1);
    if (!row) return undefined;
    const items = await this.db
      .select()
      .from(sharedListingItems)
      .where(eq(sharedListingItems.sharedListingId, row.id))
      .orderBy(asc(sharedListingItems.position));
    return SharedListing.restore({
      id: storedId<'SharedListing'>(row.id),
      tokenHash: row.tokenHash,
      clientId: storedId<'Client'>(row.clientId),
      opportunityId: row.opportunityId ?? undefined,
      channel: Channel.parse(row.channel),
      sentBy: row.sentBy,
      sentAt: row.sentAt,
      // Todo envío se guarda con vencimiento; una fila sin él se trata como vencida.
      expiresAt: row.expiresAt ?? row.sentAt,
      revokedAt: row.revokedAt ?? undefined,
      items: items.map((item) => ({
        propertyId: item.propertyId,
        position: item.position,
        firstOpenedAt: item.firstOpenedAt ?? undefined,
        openCount: item.openCount,
        reaction: item.reaction === null ? undefined : Reaction.parse(item.reaction),
        reactedAt: item.reactedAt ?? undefined,
      })),
    });
  }
}
