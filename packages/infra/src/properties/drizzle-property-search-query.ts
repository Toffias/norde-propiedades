import {
  CURRENCIES,
  FEATURE_KINDS,
  MEDIA_KINDS,
  MEDIA_PROCESSING_STATUSES,
  OPERATIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type PropertyMediaRecord,
  type PropertyOperationRecord,
  type PropertyRecord,
  type PropertySearchCriteria,
  type PropertySearchQuery,
} from '@norde/core/properties';
import { and, asc, count, eq, gte, inArray, isNull, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  features,
  locations,
  mediaItems,
  properties,
  propertyFeatures,
  propertyOperations,
} from '../db/schema';

// Búsqueda y ficha públicas (web y agente de IA). Lee `property_operations`, `property_features`
// y `media_items`; no las columnas viejas de `properties` (#33).

// Columnas `text` de la base → uniones del core. Si alguien carga un valor fuera de catálogo,
// falla fuerte en lugar de propagar un tipo mentiroso.
const PropertyEnums = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
});
const OperationEnums = z.object({ operation: z.enum(OPERATIONS), currency: z.enum(CURRENCIES) });
const MediaEnums = z.object({
  kind: z.enum(MEDIA_KINDS),
  processingStatus: z.enum(MEDIA_PROCESSING_STATUSES),
});
const VariantsSchema = z.object({
  thumbnail: z.string().optional(),
  web: z.string().optional(),
  watermarked: z.string().optional(),
});
const FeatureKindSchema = z.enum(FEATURE_KINDS);

const ACCENTED = 'áéíóúüñàèìòùâêîôû';
const PLAIN = 'aeiouunaeiouaeiou';

/** Minúsculas y sin acentos, igual que `normalizeTerm`, para comparar texto libre. */
function normalized(expression: SQL): SQL {
  return sql`translate(lower(${expression}), ${ACCENTED}, ${PLAIN})`;
}

export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function contains(expression: SQL, term: string): SQL {
  return sql`${normalized(expression)} like ${`%${escapeLike(term)}%`}`;
}

function textArray(values: readonly string[]): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** Posición de una operación en el catálogo: la principal es la primera que ofrece. */
const OPERATION_ORDER = sql`array_position(${textArray(OPERATIONS)}, ${propertyOperations.operation})`;

export class DrizzlePropertySearchQuery implements PropertySearchQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: PropertySearchCriteria) {
    const where = and(...this.filters(criteria));
    const [rows, totals] = await Promise.all([
      this.db
        .select({ id: properties.id })
        .from(properties)
        .where(where)
        .orderBy(...this.order(criteria))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(properties).where(where),
    ]);
    return { items: await this.load(rows.map((r) => r.id)), total: totals[0]?.total ?? 0 };
  }

  findById(id: string) {
    return this.findOne(eq(properties.id, id));
  }

  findBySlug(slug: string) {
    return this.findOne(eq(properties.slug, slug));
  }

  private async findOne(condition: SQL): Promise<PropertyRecord | undefined> {
    const [row] = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(and(condition, isNull(properties.deletedAt)))
      .limit(1);
    if (!row) return undefined;
    const [record] = await this.load([row.id]);
    return record;
  }

  private filters(c: PropertySearchCriteria): (SQL | undefined)[] {
    const location = c.location === undefined ? [] : this.locationWords(c.location);
    const place = sql`${properties.neighborhood} || ' ' || ${properties.city} || ' ' || coalesce(${properties.address}, '')`;
    const surface = sql`coalesce(${properties.surfaceTotalM2}, ${properties.surfaceCoveredM2})`;

    return [
      // Las de la papelera no existen para la web ni para el agente.
      isNull(properties.deletedAt),
      inArray(properties.status, [...c.statuses]),
      c.publishedOnWebOnly ? eq(properties.publishedOnWeb, true) : undefined,
      this.offersOperation(c),
      c.propertyType === undefined ? undefined : eq(properties.propertyType, c.propertyType),
      c.minRooms === undefined ? undefined : gte(properties.rooms, c.minRooms),
      c.maxRooms === undefined ? undefined : lte(properties.rooms, c.maxRooms),
      c.minBedrooms === undefined ? undefined : gte(properties.bedrooms, c.minBedrooms),
      c.minBathrooms === undefined ? undefined : gte(properties.bathrooms, c.minBathrooms),
      c.minSurfaceM2 === undefined ? undefined : sql`${surface} >= ${c.minSurfaceM2}`,
      c.creditEligible === undefined ? undefined : eq(properties.creditEligible, c.creditEligible),
      c.featuredOnly === true ? eq(properties.featured, true) : undefined,
      c.excludePropertyId === undefined ? undefined : ne(properties.id, c.excludePropertyId),
      // "Palermo Soho", "Vicente López": alcanza con que coincida alguna palabra.
      location.length === 0 ? undefined : or(...location.map((w) => contains(place, w))),
      c.locationId === undefined ? undefined : this.withinLocation(c.locationId),
      ...(c.featureIds ?? []).map(
        (featureId) =>
          sql`exists (select 1 from ${propertyFeatures} where ${propertyFeatures.propertyId} = ${properties.id} and ${propertyFeatures.featureId} = ${featureId})`,
      ),
      ...(c.amenities ?? []).map((amenity) => {
        const term = normalizeTerm(amenity);
        const name = sql`${features.name}`;
        // Coincidencia parcial en los dos sentidos: "pileta" ~ "Pileta climatizada".
        return sql`exists (select 1 from ${propertyFeatures} join ${features} on ${features.id} = ${propertyFeatures.featureId} where ${propertyFeatures.propertyId} = ${properties.id} and ${features.isActive} and (${contains(name, term)} or ${term} like '%' || ${normalized(name)} || '%'))`;
      }),
    ];
  }

  /**
   * Ofrece la operación buscada (o alguna), en la moneda y el rango de precio pedidos. El
   * filtro de precio deja afuera los precios ocultos: no puede revelar un precio que no se muestra.
   */
  private offersOperation(c: PropertySearchCriteria): SQL {
    const filtersPrice = c.minPriceCents !== undefined || c.maxPriceCents !== undefined;
    const conditions = and(
      sql`${propertyOperations.propertyId} = ${properties.id}`,
      c.operation === undefined ? undefined : eq(propertyOperations.operation, c.operation),
      c.currency === undefined ? undefined : eq(propertyOperations.currency, c.currency),
      filtersPrice ? eq(properties.priceOnWeb, true) : undefined,
      filtersPrice ? eq(propertyOperations.priceOnRequest, false) : undefined,
      c.minPriceCents === undefined
        ? undefined
        : gte(propertyOperations.priceCents, c.minPriceCents),
      c.maxPriceCents === undefined
        ? undefined
        : lte(propertyOperations.priceCents, c.maxPriceCents),
    );
    return sql`exists (select 1 from ${propertyOperations} where ${conditions})`;
  }

  /** La ubicación o cualquiera de sus descendientes, por la ruta materializada. */
  private withinLocation(locationId: string): SQL {
    return sql`exists (select 1 from ${locations} where ${locations.id} = ${properties.locationId} and ${locations.path} like (select root.path from ${locations} as root where root.id = ${locationId}) || '%')`;
  }

  private order(c: PropertySearchCriteria): SQL[] {
    const newest = [sql`${properties.createdAt} desc`, sql`${properties.id} asc`];
    switch (c.sort) {
      case 'featured':
        return [sql`${properties.featured} desc`, ...newest];
      case 'newest':
        return newest;
      case 'surface_desc':
        return [
          sql`coalesce(${properties.surfaceTotalM2}, ${properties.surfaceCoveredM2}) desc nulls last`,
          ...newest,
        ];
      case 'price_asc':
      case 'price_desc': {
        // Precio público de la operación buscada (o la principal), agrupado por moneda; los
        // ocultos van al final.
        const ofSortOperation = (column: SQL) =>
          sql`(select ${column} from ${propertyOperations} where ${propertyOperations.propertyId} = ${properties.id}${
            c.operation === undefined
              ? sql``
              : sql` and ${propertyOperations.operation} = ${c.operation}`
          } order by ${OPERATION_ORDER} limit 1)`;
        const visiblePrice = ofSortOperation(
          sql`case when ${properties.priceOnWeb} and not ${propertyOperations.priceOnRequest} then ${propertyOperations.priceCents} end`,
        );
        const direction = c.sort === 'price_asc' ? sql`asc` : sql`desc`;
        return [
          sql`${visiblePrice} is null`,
          sql`${ofSortOperation(sql`${propertyOperations.currency}`)} asc`,
          sql`${visiblePrice} ${direction}`,
          ...newest,
        ];
      }
    }
  }

  private locationWords(location: string): string[] {
    return normalizeTerm(location)
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  /** Arma las filas completas de una página (a lo sumo una página), en el orden de `ids`. */
  private async load(ids: readonly string[]): Promise<PropertyRecord[]> {
    if (ids.length === 0) return [];
    const list = [...ids];
    const [rows, operations, featureRows, media] = await Promise.all([
      this.db.select().from(properties).where(inArray(properties.id, list)),
      this.db
        .select()
        .from(propertyOperations)
        .where(inArray(propertyOperations.propertyId, list))
        .orderBy(OPERATION_ORDER),
      this.db
        .select({
          propertyId: propertyFeatures.propertyId,
          kind: features.kind,
          name: features.name,
        })
        .from(propertyFeatures)
        .innerJoin(features, eq(features.id, propertyFeatures.featureId))
        .where(and(inArray(propertyFeatures.propertyId, list), eq(features.isActive, true)))
        .orderBy(
          sql`array_position(${textArray(FEATURE_KINDS)}, ${features.kind})`,
          asc(features.position),
          asc(features.name),
        ),
      this.db
        .select()
        .from(mediaItems)
        .where(inArray(mediaItems.propertyId, list))
        .orderBy(sql`${mediaItems.isCover} desc`, asc(mediaItems.position), asc(mediaItems.id)),
    ]);

    const operationsOf = groupByProperty(operations);
    const featuresOf = groupByProperty(featureRows);
    const mediaOf = groupByProperty(media);
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    return list.flatMap((id) => {
      const row = rowsById.get(id);
      if (!row) return [];
      return [
        toRecord(row, {
          operations: (operationsOf.get(id) ?? []).map(toOperation),
          features: (featuresOf.get(id) ?? []).map((f) => ({
            kind: FeatureKindSchema.parse(f.kind),
            name: f.name,
          })),
          media: (mediaOf.get(id) ?? []).map(toMedia),
        }),
      ];
    });
  }
}

function groupByProperty<T extends { readonly propertyId: string | null }>(
  items: readonly T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    if (item.propertyId === null) continue;
    const group = grouped.get(item.propertyId);
    if (group) group.push(item);
    else grouped.set(item.propertyId, [item]);
  }
  return grouped;
}

function toOperation(row: typeof propertyOperations.$inferSelect): PropertyOperationRecord {
  return {
    ...OperationEnums.parse(row),
    priceCents: row.priceCents,
    priceOnRequest: row.priceOnRequest,
  };
}

function toMedia(row: typeof mediaItems.$inferSelect): PropertyMediaRecord {
  const enums = MediaEnums.parse(row);
  const isLink = enums.kind === 'video' || enums.kind === 'tour_360';
  const variants = VariantsSchema.parse(row.variants);
  return {
    id: row.id,
    kind: enums.kind,
    storageKey: row.storageKey,
    // `url` guarda el link de videos y recorridos, o de las fotos importadas sin archivo; en
    // las fotos subidas repite la clave del storage.
    externalUrl: isLink || row.storageKey === null ? row.url : null,
    showOnWeb: row.showOnWeb,
    processing: enums.processingStatus,
    variants: {
      ...(variants.thumbnail === undefined ? {} : { thumbnail: variants.thumbnail }),
      ...(variants.web === undefined ? {} : { web: variants.web }),
      ...(variants.watermarked === undefined ? {} : { watermarked: variants.watermarked }),
    },
    width: row.width,
    height: row.height,
    description: row.description,
    updatedAt: row.updatedAt,
  };
}

function toRecord(
  row: typeof properties.$inferSelect,
  children: Pick<PropertyRecord, 'operations' | 'features' | 'media'>,
): PropertyRecord {
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    title: row.title,
    description: row.description,
    ...PropertyEnums.parse(row),
    publishedOnWeb: row.publishedOnWeb,
    featured: row.featured,
    showPriceOnWeb: row.priceOnWeb,
    address: row.address,
    showExactAddress: row.showExactAddress,
    publishAddress: row.publishAddress,
    neighborhood: row.neighborhood,
    city: row.city,
    province: row.province,
    latitude: row.latitude,
    longitude: row.longitude,
    expensesCents: row.expensesCents,
    rooms: row.rooms,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    toilets: row.toilets,
    parkingSpaces: row.parkingSpaces,
    ageYears: row.ageYears,
    condition: row.condition,
    disposition: row.disposition,
    orientation: row.orientation,
    surfaceTotalM2: row.surfaceTotalM2,
    surfaceCoveredM2: row.surfaceCoveredM2,
    surfaceSemiCoveredM2: row.surfaceSemiCoveredM2,
    surfaceLandM2: row.surfaceLandM2,
    frontM: row.frontM,
    depthM: row.depthM,
    isFurnished: row.isFurnished,
    creditEligible: row.creditEligible,
    professionalUse: row.professionalUse,
    developmentId: row.developmentId,
    updatedAt: row.updatedAt,
    ...children,
  };
}
