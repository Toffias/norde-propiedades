import type { PropertyInterestProfile } from '@norde/core/clients';
import type {
  PortalPublicationStats,
  PropertyStatisticsQuery,
  StatisticsRange,
} from '@norde/core/reporting';
import { and, asc, countDistinct, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import { matchingSavedSearches } from '../clients/saved-search-matching';
import type { DbExecutor } from '../db/executor';
import {
  clients,
  clientTagAssignments,
  clientTags,
  inquiries,
  portalListingDailyStats,
  portalListings,
  savedSearches,
  sharedListingItems,
  sharedListings,
} from '../db/schema';

/** El mes de Buenos Aires de una fecha, como lo muestra el gráfico (`AAAA-MM`). */
function month(column: typeof sharedListings.sentAt | typeof inquiries.receivedAt) {
  return sql<string>`to_char(${column} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM')`;
}

/** Portales por propiedad: uno por portal configurado. */
const MAX_PORTALS = 20;
/** Meses de un rango: el gráfico pide como mucho dos años. */
const MAX_MONTHS = 30;

/** Agregados de la actividad de una propiedad, calculados en la base con los índices por propiedad. */
export class DrizzlePropertyStatisticsQuery implements PropertyStatisticsQuery {
  constructor(private readonly db: DbExecutor) {}

  async monthly(propertyId: string, range: StatisticsRange) {
    const sendMonth = month(sharedListings.sentAt);
    const inquiryMonth = month(inquiries.receivedAt);
    const [sends, received] = await Promise.all([
      this.db
        .select({
          month: sendMonth,
          email: sql<number>`count(*) filter (where ${sharedListings.channel} = 'email')::int`,
          whatsapp: sql<number>`count(*) filter (where ${sharedListings.channel} = 'whatsapp')::int`,
        })
        .from(sharedListingItems)
        .innerJoin(sharedListings, eq(sharedListings.id, sharedListingItems.sharedListingId))
        .where(
          and(
            eq(sharedListingItems.propertyId, propertyId),
            gte(sharedListings.sentAt, range.from),
            lt(sharedListings.sentAt, range.to),
          ),
        )
        .groupBy(sendMonth)
        .limit(MAX_MONTHS),
      this.db
        .select({ month: inquiryMonth, total: sql<number>`count(*)::int` })
        .from(inquiries)
        .where(
          and(
            eq(inquiries.propertyId, propertyId),
            isNull(inquiries.deletedAt),
            gte(inquiries.receivedAt, range.from),
            lt(inquiries.receivedAt, range.to),
          ),
        )
        .groupBy(inquiryMonth)
        .limit(MAX_MONTHS),
    ]);
    const months = new Map<
      string,
      { month: string; emailSends: number; whatsappSends: number; inquiries: number }
    >();
    const row = (key: string) => {
      const found = months.get(key) ?? {
        month: key,
        emailSends: 0,
        whatsappSends: 0,
        inquiries: 0,
      };
      months.set(key, found);
      return found;
    };
    for (const send of sends) {
      const current = row(send.month);
      current.emailSends = send.email;
      current.whatsappSends = send.whatsapp;
    }
    for (const inquiry of received) row(inquiry.month).inquiries = inquiry.total;
    return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  async interestedCount(profile: PropertyInterestProfile): Promise<number> {
    const [row] = await this.db
      .select({ total: countDistinct(clients.id) })
      .from(savedSearches)
      .innerJoin(clients, eq(clients.id, savedSearches.clientId))
      .where(matchingSavedSearches(profile));
    return row?.total ?? 0;
  }

  async interestedTags(profile: PropertyInterestProfile, limit: number) {
    const clientsCount = countDistinct(clients.id);
    return this.db
      .select({ tagId: clientTags.id, name: clientTags.name, clients: clientsCount })
      .from(savedSearches)
      .innerJoin(clients, eq(clients.id, savedSearches.clientId))
      .innerJoin(clientTagAssignments, eq(clientTagAssignments.clientId, clients.id))
      .innerJoin(clientTags, eq(clientTags.id, clientTagAssignments.tagId))
      .where(matchingSavedSearches(profile))
      .groupBy(clientTags.id, clientTags.name)
      .orderBy(desc(clientsCount), asc(clientTags.name))
      .limit(limit);
  }

  async publications(
    propertyId: string,
    range: StatisticsRange,
  ): Promise<readonly PortalPublicationStats[]> {
    const inRange = and(
      eq(portalListingDailyStats.listingId, portalListings.id),
      sql`${portalListingDailyStats.date} >= (${range.from} at time zone 'America/Argentina/Buenos_Aires')::date`,
      sql`${portalListingDailyStats.date} < (${range.to} at time zone 'America/Argentina/Buenos_Aires')::date`,
    );
    const rows = await this.db
      .select({
        portal: portalListings.portal,
        status: portalListings.status,
        publishedAt: portalListings.publishedAt,
        views: sql<number>`coalesce(sum(${portalListingDailyStats.views}), 0)::int`,
        contacts: sql<number>`coalesce(sum(${portalListingDailyStats.contacts}), 0)::int`,
        favorites: sql<number>`coalesce(sum(${portalListingDailyStats.favorites}), 0)::int`,
      })
      .from(portalListings)
      .leftJoin(portalListingDailyStats, inRange)
      .where(eq(portalListings.propertyId, propertyId))
      .groupBy(
        portalListings.id,
        portalListings.portal,
        portalListings.status,
        portalListings.publishedAt,
      )
      .orderBy(asc(portalListings.portal))
      .limit(MAX_PORTALS);
    return rows.map((row) => ({ ...row, publishedAt: row.publishedAt ?? undefined }));
  }
}
