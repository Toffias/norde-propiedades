import {
  LISTING_REACTIONS,
  SHARED_LISTING_CHANNELS,
  type ClientSendItem,
  type ClientSendsQuery,
} from '@norde/core/clients';
import { asc, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { sharedListingItems, sharedListings } from '../db/schema';

const Channel = z.enum(SHARED_LISTING_CHANNELS);
const Reaction = z.enum(LISTING_REACTIONS).nullable();

/**
 * Los envíos de un contacto, por `shared_listings_client_sent_idx`. Las propiedades de cada uno
 * se leen solo para los de la página.
 */
export class DrizzleClientSendsQuery implements ClientSendsQuery {
  constructor(private readonly db: DbExecutor) {}

  async sends(criteria: {
    readonly clientId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<{ readonly items: readonly ClientSendItem[]; readonly total: number }> {
    const where = eq(sharedListings.clientId, criteria.clientId);
    const order = criteria.direction === 'asc' ? asc : desc;
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(sharedListings)
        .where(where)
        .orderBy(order(sharedListings.sentAt), order(sharedListings.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db.select({ total: count() }).from(sharedListings).where(where),
    ]);
    const items =
      rows.length === 0
        ? []
        : await this.db
            .select()
            .from(sharedListingItems)
            .where(
              inArray(
                sharedListingItems.sharedListingId,
                rows.map((row) => row.id),
              ),
            )
            .orderBy(asc(sharedListingItems.position));

    return {
      items: rows.map((row): ClientSendItem => {
        const own = items.filter((item) => item.sharedListingId === row.id);
        const opened = own
          .map((item) => item.firstOpenedAt)
          .filter((date): date is Date => date !== null)
          .sort((a, b) => a.getTime() - b.getTime());
        return {
          id: row.id,
          channel: Channel.parse(row.channel),
          sentAt: row.sentAt,
          sentBy: row.sentBy,
          // Todo envío se guarda con vencimiento; una fila sin él se muestra como vencida.
          expiresAt: row.expiresAt ?? row.sentAt,
          revokedAt: row.revokedAt ?? undefined,
          properties: own.map((item) => ({
            id: item.propertyId,
            reaction: Reaction.parse(item.reaction) ?? undefined,
          })),
          firstOpenedAt: opened[0],
          // Cada apertura del link suma una a todas sus propiedades.
          openCount: Math.max(0, ...own.map((item) => item.openCount)),
        };
      }),
      total: totals[0]?.total ?? 0,
    };
  }
}
