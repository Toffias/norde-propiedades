import {
  CONSTRUCTION_STATUSES,
  CURRENCIES,
  DEVELOPMENT_KINDS,
  DEVELOPMENT_STATUSES,
  FEATURE_KINDS,
  type LocationLevel,
  type PropertyStatus,
  type PublishedDevelopmentCriteria,
  type PublishedDevelopmentQuery,
  type PublishedDevelopmentRecord,
  type UnitPriceFrom,
} from '@norde/core/properties';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  developmentFeatures,
  developments,
  features,
  locations,
  mediaItems,
  properties,
  propertyOperations,
} from '../db/schema';

import { toPropertyMediaRecord } from './drizzle-property-search-query';

// Listado y ficha de emprendimientos para la web. Lee solo columnas públicas: la dirección exacta,
// el desarrollista y el contacto comercial nunca salen de acá.

const RowEnums = z.object({
  developmentType: z.enum(DEVELOPMENT_KINDS).nullable(),
  status: z.enum(DEVELOPMENT_STATUSES),
  constructionStatus: z.enum(CONSTRUCTION_STATUSES).nullable(),
});
const CurrencySchema = z.enum(CURRENCIES);
const FeatureKindSchema = z.enum(FEATURE_KINDS);

function textArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

const publicColumns = {
  id: developments.id,
  code: developments.code,
  slug: developments.slug,
  name: developments.name,
  developmentType: developments.developmentType,
  status: developments.status,
  constructionStatus: developments.constructionStatus,
  deliveryDate: developments.deliveryDate,
  publishAddress: developments.publishAddress,
  locationId: developments.locationId,
  latitude: developments.latitude,
  longitude: developments.longitude,
  description: developments.description,
  financingDetails: developments.financingDetails,
  isFinanced: developments.isFinanced,
  acceptsSwap: developments.acceptsSwap,
  immediateDeed: developments.immediateDeed,
  deletedAt: developments.deletedAt,
  updatedAt: developments.updatedAt,
};
type PublicRow = Pick<typeof developments.$inferSelect, keyof typeof publicColumns>;

/**
 * Emprendimientos de la web. Los filtros y órdenes del listado tienen índice: `status` + orden
 * (migración 0037), y tipo y estado de obra (0023). Las unidades salen por
 * `properties_development_idx`. El test de integración lo cubre.
 */
export class DrizzlePublishedDevelopmentQuery implements PublishedDevelopmentQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(
    criteria: PublishedDevelopmentCriteria,
  ): Promise<PageSlice<PublishedDevelopmentRecord>> {
    const where = and(
      // Los de la papelera no existen para la web.
      isNull(developments.deletedAt),
      inArray(developments.status, [...criteria.statuses]),
      criteria.developmentType === undefined
        ? undefined
        : eq(developments.developmentType, criteria.developmentType),
      criteria.constructionStatus === undefined
        ? undefined
        : eq(developments.constructionStatus, criteria.constructionStatus),
    );
    const [rows, total] = await Promise.all([
      this.db
        .select(publicColumns)
        .from(developments)
        .where(where)
        .orderBy(...this.order(criteria))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db
        .select({ total: count() })
        .from(developments)
        .where(where)
        .then(([row]) => row?.total ?? 0),
    ]);
    return { items: await this.load(rows, criteria.unitStatuses), total };
  }

  findBySlug(slug: string, unitStatuses: readonly PropertyStatus[]) {
    return this.findOne(eq(developments.slug, slug), unitStatuses);
  }

  /** `mediaId` ya validado como UUID por el caso de uso. */
  findByMediaId(mediaId: string, unitStatuses: readonly PropertyStatus[]) {
    const owner = this.db
      .select({ id: mediaItems.developmentId })
      .from(mediaItems)
      .where(and(eq(mediaItems.id, mediaId), isNotNull(mediaItems.developmentId)));
    return this.findOne(inArray(developments.id, owner), unitStatuses);
  }

  private async findOne(
    condition: SQL,
    unitStatuses: readonly PropertyStatus[],
  ): Promise<PublishedDevelopmentRecord | undefined> {
    const rows = await this.db.select(publicColumns).from(developments).where(condition).limit(1);
    const [record] = await this.load(rows, unitStatuses);
    return record;
  }

  /** Cada orden coincide con su índice (migración 0037), con `id` para desempatar. */
  private order(criteria: PublishedDevelopmentCriteria): SQL[] {
    switch (criteria.sort) {
      case 'newest':
        return [sql`${developments.createdAt} desc nulls last`, sql`${developments.id} asc`];
      case 'delivery_asc':
        // Sin fecha de entrega van al final.
        return [sql`${developments.deliveryDate} asc nulls last`, sql`${developments.id} asc`];
    }
  }

  /** Arma las filas completas de una página (a lo sumo una página), en su orden. */
  private async load(
    rows: readonly PublicRow[],
    unitStatuses: readonly PropertyStatus[],
  ): Promise<PublishedDevelopmentRecord[]> {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];
    const [featureRows, media, units, prices, paths] = await Promise.all([
      this.db
        .select({
          developmentId: developmentFeatures.developmentId,
          kind: features.kind,
          name: features.name,
        })
        .from(developmentFeatures)
        .innerJoin(features, eq(features.id, developmentFeatures.featureId))
        .where(and(inArray(developmentFeatures.developmentId, ids), eq(features.isActive, true)))
        .orderBy(
          sql`array_position(${textArray(FEATURE_KINDS)}, ${features.kind})`,
          asc(features.position),
          asc(features.name),
        ),
      this.db
        .select()
        .from(mediaItems)
        .where(inArray(mediaItems.developmentId, ids))
        .orderBy(sql`${mediaItems.isCover} desc`, asc(mediaItems.position), asc(mediaItems.id)),
      this.db
        .select({ developmentId: properties.developmentId, units: count() })
        .from(properties)
        .where(listedUnitsOf(ids, unitStatuses))
        .groupBy(properties.developmentId),
      // El "desde": venta, con precio visible en la web.
      this.db
        .select({
          developmentId: properties.developmentId,
          currency: propertyOperations.currency,
          amountCents: sql<bigint>`min(${propertyOperations.priceCents})`.mapWith((value) =>
            BigInt(String(value)),
          ),
        })
        .from(properties)
        .innerJoin(propertyOperations, eq(propertyOperations.propertyId, properties.id))
        .where(
          and(
            listedUnitsOf(ids, unitStatuses),
            eq(propertyOperations.operation, 'sale'),
            eq(properties.priceOnWeb, true),
            eq(propertyOperations.priceOnRequest, false),
            isNotNull(propertyOperations.priceCents),
          ),
        )
        .groupBy(properties.developmentId, propertyOperations.currency),
      this.locationPaths(rows),
    ]);

    const featuresOf = groupBy(featureRows, (f) => f.developmentId);
    const mediaOf = groupBy(media, (m) => m.developmentId);
    const unitsOf = new Map(units.map((u) => [u.developmentId, u.units]));
    const pricesOf = groupBy(prices, (p) => p.developmentId);

    return rows.map((row): PublishedDevelopmentRecord => {
      const enums = RowEnums.parse(row);
      return {
        id: row.id,
        code: row.code,
        slug: row.slug,
        name: row.name,
        ...enums,
        deliveryDate: row.deliveryDate,
        publishAddress: row.publishAddress,
        locationPath: row.locationId === null ? [] : (paths.get(row.locationId) ?? []),
        latitude: row.latitude,
        longitude: row.longitude,
        description: row.description,
        financingDetails: row.financingDetails,
        isFinanced: row.isFinanced,
        acceptsSwap: row.acceptsSwap,
        immediateDeed: row.immediateDeed,
        features: (featuresOf.get(row.id) ?? []).map((f) => ({
          kind: FeatureKindSchema.parse(f.kind),
          name: f.name,
        })),
        media: (mediaOf.get(row.id) ?? []).map(toPropertyMediaRecord),
        listedUnitCount: unitsOf.get(row.id) ?? 0,
        unitPricesFrom: (pricesOf.get(row.id) ?? []).map((p): UnitPriceFrom => ({
          currency: CurrencySchema.parse(p.currency),
          amountCents: p.amountCents,
        })),
        deletedAt: row.deletedAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  /** La ruta de cada ubicación (del país al nivel elegido), por la ruta materializada. */
  private async locationPaths(
    rows: readonly PublicRow[],
  ): Promise<Map<string, readonly LocationLevel[]>> {
    const locationIds = [
      ...new Set(rows.flatMap((row) => (row.locationId === null ? [] : [row.locationId]))),
    ];
    if (locationIds.length === 0) return new Map();
    const chosen = await this.db
      .select({ id: locations.id, path: locations.path })
      .from(locations)
      .where(inArray(locations.id, locationIds));
    const idsOf = new Map(
      chosen.map((c) => [c.id, c.path.split('/').filter((part) => part !== '')]),
    );
    const ancestorIds = [...new Set([...idsOf.values()].flat())];
    const levels =
      ancestorIds.length === 0
        ? []
        : await this.db
            .select({ id: locations.id, kind: locations.kind, name: locations.name })
            .from(locations)
            .where(inArray(locations.id, ancestorIds));
    const byId = new Map(levels.map((level) => [level.id, level]));
    return new Map(
      [...idsOf].map(([id, path]) => [
        id,
        path.flatMap((ancestor) => {
          const level = byId.get(ancestor);
          return level ? [{ kind: level.kind, name: level.name }] : [];
        }),
      ]),
    );
  }
}

/** Las unidades que se muestran al público: activas, publicadas en la web y en esos estados. */
function listedUnitsOf(
  developmentIds: readonly string[],
  unitStatuses: readonly PropertyStatus[],
): SQL | undefined {
  return and(
    inArray(properties.developmentId, [...developmentIds]),
    isNull(properties.deletedAt),
    eq(properties.publishedOnWeb, true),
    inArray(properties.status, [...unitStatuses]),
  );
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const group = grouped.get(key);
    if (group) group.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}
