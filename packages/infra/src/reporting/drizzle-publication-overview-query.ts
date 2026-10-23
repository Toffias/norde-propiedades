import { PORTALS, type ListingOwnerKind, type PortalId } from '@norde/core/portals';
import {
  LISTING_OPERATION_VALUES,
  LISTING_STATUS_VALUES,
  LISTING_TYPE_VALUES,
} from '@norde/core/portals/contracts';
import {
  SIMPLE_PLANS,
  type ListingTally,
  type PortalKindTally,
  type PortalPublicationRequest,
  type PublicationCriteria,
  type PublicationOverviewQuery,
  type PublishableStatuses,
} from '@norde/core/reporting';
import type { PortalPublicationRow } from '@norde/core/reporting/contracts';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { developments, portalAccounts, portalListings, properties } from '../db/schema';

const Portal = z.enum(PORTALS);
const OwnerKind = z.enum(['property', 'development']);

const TallyRow = z.object({
  portal: Portal,
  kind: OwnerKind,
  status: z.string(),
  listingType: z.string(),
  plan: z.string().nullable(),
  hasReason: z.boolean(),
  count: z.number().int().nonnegative(),
});

const ListingRow = z.object({
  operation: z.enum(LISTING_OPERATION_VALUES).nullable(),
  listingType: z.enum(LISTING_TYPE_VALUES),
  status: z.enum(LISTING_STATUS_VALUES),
});

/** Las columnas del aviso que muestra el listado. */
interface ListingColumns {
  readonly listingId: string;
  readonly operation: string | null;
  readonly listingType: string;
  readonly plan: string | null;
  readonly status: string;
  readonly lastError: string | null;
  readonly permalink: string | null;
}

const ownerKind = sql<string>`case when ${portalListings.propertyId} is null then 'development' else 'property' end`;

/** Un aviso vivo: dado de baja no cuenta como publicado ni frena lo que falta publicar. */
const alive = ne(portalListings.status, 'unpublished');

/**
 * Difusión (#114). Los filtros por portal y estado usan `portal_listings_portal_status_idx` y el
 * orden del listado, `portal_listings_portal_status_updated_idx`; lo que falta publicar recorre lo
 * disponible por `properties_status_updated_idx` / `developments_status_updated_idx` y busca el
 * aviso por `portal_listings_property_idx` / `portal_listings_development_idx`.
 */
export class DrizzlePublicationOverviewQuery implements PublicationOverviewQuery {
  constructor(private readonly db: DbExecutor) {}

  async enabledPortals(): Promise<readonly PortalId[]> {
    const rows = await this.db
      .select({ portal: portalAccounts.portal })
      .from(portalAccounts)
      .where(eq(portalAccounts.isEnabled, true));
    return rows.flatMap((row) => {
      const parsed = Portal.safeParse(row.portal);
      return parsed.success ? [parsed.data] : [];
    });
  }

  async availability(publishable: PublishableStatuses) {
    const [[property], [development]] = await Promise.all([
      this.db
        .select({
          available: count(),
          onWeb: sql<number>`count(*) filter (where ${properties.publishedOnWeb})`.mapWith(Number),
        })
        .from(properties)
        .where(this.#availableProperties(publishable)),
      this.db
        .select({
          available: count(),
          onWeb: sql<number>`count(*) filter (where ${developments.publishedOnWeb})`.mapWith(
            Number,
          ),
        })
        .from(developments)
        .where(this.#availableDevelopments(publishable)),
    ]);
    return {
      properties: { available: property?.available ?? 0, onWeb: property?.onWeb ?? 0 },
      developments: { available: development?.available ?? 0, onWeb: development?.onWeb ?? 0 },
    };
  }

  async listingTallies(portals: readonly PortalId[]): Promise<readonly PortalKindTally[]> {
    if (portals.length === 0) return [];
    const where = and(inArray(portalListings.portal, [...portals]), alive);
    const hasReason = sql<boolean>`${portalListings.lastError} is not null`;
    const [tallies, owners] = await Promise.all([
      this.db
        .select({
          portal: portalListings.portal,
          kind: ownerKind,
          status: portalListings.status,
          listingType: portalListings.listingType,
          plan: portalListings.plan,
          hasReason,
          count: count(),
        })
        .from(portalListings)
        .where(where)
        .groupBy(
          portalListings.portal,
          ownerKind,
          portalListings.status,
          portalListings.listingType,
          portalListings.plan,
          hasReason,
        ),
      this.db
        .select({
          portal: portalListings.portal,
          kind: ownerKind,
          owners: countDistinct(
            sql`coalesce(${portalListings.propertyId}, ${portalListings.developmentId})`,
          ),
        })
        .from(portalListings)
        .where(
          and(inArray(portalListings.portal, [...portals]), eq(portalListings.status, 'published')),
        )
        .groupBy(portalListings.portal, ownerKind),
    ]);

    const grouped = new Map<
      string,
      { portal: PortalId; kind: ListingOwnerKind; tallies: ListingTally[] }
    >();
    for (const raw of tallies) {
      const row = TallyRow.parse(raw);
      const key = `${row.portal}:${row.kind}`;
      const entry = grouped.get(key) ?? { portal: row.portal, kind: row.kind, tallies: [] };
      entry.tallies.push({
        status: row.status,
        listingType: row.listingType,
        plan: row.plan ?? undefined,
        hasReason: row.hasReason,
        count: row.count,
      });
      grouped.set(key, entry);
    }
    return [...grouped.values()].map((entry) => ({
      ...entry,
      publishedOwners:
        owners.find((o) => o.portal === entry.portal && o.kind === entry.kind)?.owners ?? 0,
    }));
  }

  async missingCount(
    portal: PortalId,
    kind: ListingOwnerKind,
    publishable: PublishableStatuses,
  ): Promise<number> {
    const [row] =
      kind === 'property'
        ? await this.db
            .select({ total: count() })
            .from(properties)
            .where(this.#missingProperties(portal, publishable))
        : await this.db
            .select({ total: count() })
            .from(developments)
            .where(this.#missingDevelopments(portal, publishable));
    return row?.total ?? 0;
  }

  async list(request: PortalPublicationRequest): Promise<PageSlice<PortalPublicationRow>> {
    const { criteria } = request;
    if (criteria.kind === 'missing') {
      return request.kind === 'property'
        ? this.#missingPropertyRows(request)
        : this.#missingDevelopmentRows(request);
    }
    return request.kind === 'property'
      ? this.#listedPropertyRows(request, criteria)
      : this.#listedDevelopmentRows(request, criteria);
  }

  #availableProperties(publishable: PublishableStatuses): SQL | undefined {
    // Las unidades de un emprendimiento se publican con él: no cuentan como propiedades sueltas.
    return and(
      eq(properties.status, publishable.property),
      isNull(properties.deletedAt),
      isNull(properties.developmentId),
    );
  }

  #availableDevelopments(publishable: PublishableStatuses): SQL | undefined {
    return and(eq(developments.status, publishable.development), isNull(developments.deletedAt));
  }

  #missingProperties(portal: PortalId, publishable: PublishableStatuses): SQL | undefined {
    return and(
      this.#availableProperties(publishable),
      notExists(
        this.db
          .select({ one: sql`1` })
          .from(portalListings)
          .where(
            and(
              eq(portalListings.propertyId, properties.id),
              eq(portalListings.portal, portal),
              alive,
            ),
          ),
      ),
    );
  }

  #missingDevelopments(portal: PortalId, publishable: PublishableStatuses): SQL | undefined {
    return and(
      this.#availableDevelopments(publishable),
      notExists(
        this.db
          .select({ one: sql`1` })
          .from(portalListings)
          .where(
            and(
              eq(portalListings.developmentId, developments.id),
              eq(portalListings.portal, portal),
              alive,
            ),
          ),
      ),
    );
  }

  #listedWhere(
    request: PortalPublicationRequest,
    criteria: Extract<PublicationCriteria, { kind: 'listed' }>,
  ): SQL | undefined {
    const featured = or(
      eq(portalListings.listingType, 'featured'),
      and(
        isNotNull(portalListings.plan),
        sql`${portalListings.plan} <> all(${sql.param([...SIMPLE_PLANS])}::text[])`,
      ),
    );
    return and(
      eq(portalListings.portal, request.portal),
      inArray(portalListings.status, [...criteria.statuses]),
      request.kind === 'property'
        ? isNotNull(portalListings.propertyId)
        : isNotNull(portalListings.developmentId),
      criteria.tier === 'featured' ? featured : undefined,
      criteria.tier === 'simple' ? sql`not coalesce(${featured}, false)` : undefined,
      criteria.portalPaused === true ? isNotNull(portalListings.lastError) : undefined,
      criteria.portalPaused === false ? isNull(portalListings.lastError) : undefined,
    );
  }

  #listingColumns() {
    return {
      listingId: portalListings.id,
      operation: portalListings.operation,
      listingType: portalListings.listingType,
      plan: portalListings.plan,
      status: portalListings.status,
      lastError: portalListings.lastError,
      permalink: portalListings.permalink,
      updatedAt: portalListings.updatedAt,
    };
  }

  #toListing(row: ListingColumns): NonNullable<PortalPublicationRow['listing']> {
    const parsed = ListingRow.parse(row);
    return {
      id: row.listingId,
      operation: parsed.operation ?? undefined,
      listingType: parsed.listingType,
      plan: row.plan ?? undefined,
      status: parsed.status,
      lastError: row.lastError ?? undefined,
      permalink: row.permalink ?? undefined,
    };
  }

  async #listedPropertyRows(
    request: PortalPublicationRequest,
    criteria: Extract<PublicationCriteria, { kind: 'listed' }>,
  ): Promise<PageSlice<PortalPublicationRow>> {
    const where = this.#listedWhere(request, criteria);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          ...this.#listingColumns(),
          ownerId: properties.id,
          code: properties.code,
          title: sql<string>`coalesce(${properties.portalTitle}, ${properties.title})`,
        })
        .from(portalListings)
        .innerJoin(properties, eq(properties.id, portalListings.propertyId))
        .where(where)
        .orderBy(...order(request, portalListings.updatedAt, portalListings.id))
        .limit(request.limit)
        .offset(request.offset),
      this.db.select({ total: count() }).from(portalListings).where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        owner: { kind: 'property', id: row.ownerId, code: row.code, title: row.title },
        listing: this.#toListing(row),
        updatedAt: row.updatedAt,
      })),
    };
  }

  async #listedDevelopmentRows(
    request: PortalPublicationRequest,
    criteria: Extract<PublicationCriteria, { kind: 'listed' }>,
  ): Promise<PageSlice<PortalPublicationRow>> {
    const where = this.#listedWhere(request, criteria);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          ...this.#listingColumns(),
          ownerId: developments.id,
          code: developments.code,
          name: developments.name,
        })
        .from(portalListings)
        .innerJoin(developments, eq(developments.id, portalListings.developmentId))
        .where(where)
        .orderBy(...order(request, portalListings.updatedAt, portalListings.id))
        .limit(request.limit)
        .offset(request.offset),
      this.db.select({ total: count() }).from(portalListings).where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        owner: { kind: 'development', id: row.ownerId, code: row.code, name: row.name },
        listing: this.#toListing(row),
        updatedAt: row.updatedAt,
      })),
    };
  }

  async #missingPropertyRows(
    request: PortalPublicationRequest,
  ): Promise<PageSlice<PortalPublicationRow>> {
    const where = this.#missingProperties(request.portal, request.publishable);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: properties.id,
          code: properties.code,
          title: sql<string>`coalesce(${properties.portalTitle}, ${properties.title})`,
          updatedAt: properties.updatedAt,
        })
        .from(properties)
        .where(where)
        .orderBy(...order(request, properties.updatedAt, properties.id))
        .limit(request.limit)
        .offset(request.offset),
      this.db.select({ total: count() }).from(properties).where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        owner: { kind: 'property', id: row.id, code: row.code, title: row.title },
        listing: undefined,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async #missingDevelopmentRows(
    request: PortalPublicationRequest,
  ): Promise<PageSlice<PortalPublicationRow>> {
    const where = this.#missingDevelopments(request.portal, request.publishable);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: developments.id,
          code: developments.code,
          name: developments.name,
          updatedAt: developments.updatedAt,
        })
        .from(developments)
        .where(where)
        .orderBy(...order(request, developments.updatedAt, developments.id))
        .limit(request.limit)
        .offset(request.offset),
      this.db.select({ total: count() }).from(developments).where(where),
    ]);
    return {
      total: total?.total ?? 0,
      items: rows.map((row) => ({
        owner: { kind: 'development', id: row.id, code: row.code, name: row.name },
        listing: undefined,
        updatedAt: row.updatedAt,
      })),
    };
  }
}

/** Orden total: la columna pedida y el id para desempatar. */
function order(
  request: PortalPublicationRequest,
  column: Parameters<typeof asc>[0],
  id: Parameters<typeof asc>[0],
): SQL[] {
  const by = request.sort.direction === 'asc' ? asc : desc;
  return [by(column), by(id)];
}
