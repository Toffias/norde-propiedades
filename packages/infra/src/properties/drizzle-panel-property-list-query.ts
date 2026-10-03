import {
  CURRENCIES,
  OPERATIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type BoundingBox,
  type PanelPropertyFilterCriteria,
  type PanelPropertyListCriteria,
  type PanelPropertyListItem,
  type PanelPropertyListQuery,
  type PanelPropertyOperation,
} from '@norde/core/properties';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  between,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { mediaItems, properties, propertyOperations, propertyOwners } from '../db/schema';
import { matchesSearchText } from '../db/text-search';

const RowEnums = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
});
const OperationEnums = z.object({
  operation: z.enum(OPERATIONS),
  currency: z.enum(CURRENCIES),
});

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Barrio, localidad y provincia sin acentos. Tiene que ser la misma expresión del índice
 * `properties_location_text_idx` para que el planner lo use.
 */
const locationText = sql`core.search_normalize(${properties.neighborhood} || ' ' || ${properties.city} || ' ' || ${properties.province})`;

/**
 * Columna de la fila exterior dentro de una subconsulta del `select`: drizzle no califica las
 * columnas ahí, y `"id"` se resolvería contra la tabla de la subconsulta.
 */
const outerPropertyId = sql.raw('"properties"."id"');

/** Portada de la propiedad, o su primera foto (índice `media_items_property_position_idx`). */
const coverImageUrl = sql<string | null>`(
  select m.url from ${mediaItems} m
  where m.property_id = ${outerPropertyId} and m.kind = 'photo'
  order by m.is_cover desc, m.position asc
  limit 1
)`;

const listColumns = {
  id: properties.id,
  code: properties.code,
  propertyType: properties.propertyType,
  status: properties.status,
  title: properties.title,
  portalTitle: properties.portalTitle,
  publishAddress: properties.publishAddress,
  floor: properties.floor,
  unit: properties.unit,
  developmentId: properties.developmentId,
  neighborhood: properties.neighborhood,
  city: properties.city,
  province: properties.province,
  rooms: properties.rooms,
  bedrooms: properties.bedrooms,
  bathrooms: properties.bathrooms,
  parkingSpaces: properties.parkingSpaces,
  ageYears: properties.ageYears,
  surfaceTotalM2: properties.surfaceTotalM2,
  surfaceCoveredM2: properties.surfaceCoveredM2,
  latitude: properties.latitude,
  longitude: properties.longitude,
  coverImageUrl,
  producerUserId: properties.producerUserId,
  createdAt: properties.createdAt,
  updatedAt: properties.updatedAt,
  deletedAt: properties.deletedAt,
  deletedBy: properties.deletedBy,
};

function selectList(db: DbExecutor) {
  return db.select(listColumns).from(properties);
}
type ListRow = Awaited<ReturnType<typeof selectList>>[number];

function by(direction: 'asc' | 'desc', expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

const undefinedIfNull = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * Buscador de propiedades del panel. Cada filtro y orden tiene su índice (ver `schema/properties.ts`
 * y las migraciones 0008 y 0009); el test de integración lo cubre con 5.000 propiedades.
 */
export class DrizzlePanelPropertyListQuery implements PanelPropertyListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: PanelPropertyListCriteria): Promise<PageSlice<PanelPropertyListItem>> {
    const where = and(...this.filters(criteria));
    const [rows, total] = await Promise.all([
      selectList(this.db)
        .where(where)
        .orderBy(...this.order(criteria))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.countWhere(where),
    ]);
    return { items: await this.toItems(rows), total };
  }

  async matchingIds(
    criteria: PanelPropertyFilterCriteria,
    page: { readonly afterId: string | undefined; readonly limit: number },
  ): Promise<readonly { readonly id: string; readonly code: string }[]> {
    return this.db
      .select({ id: properties.id, code: properties.code })
      .from(properties)
      .where(
        and(
          ...this.filters(criteria),
          page.afterId === undefined ? undefined : gt(properties.id, page.afterId),
        ),
      )
      .orderBy(asc(properties.id))
      .limit(page.limit);
  }

  count(criteria: PanelPropertyFilterCriteria): Promise<number> {
    return this.countWhere(and(...this.filters(criteria)));
  }

  async mapPins(
    criteria: PanelPropertyFilterCriteria,
    area: BoundingBox,
    limit: number,
  ): Promise<PageSlice<PanelPropertyListItem>> {
    // Sin PostGIS: el rectángulo se resuelve con `properties_coordinates_idx` (lat, long).
    const where = and(
      ...this.filters(criteria),
      isNotNull(properties.latitude),
      isNotNull(properties.longitude),
      between(properties.latitude, area.south, area.north),
      between(properties.longitude, area.west, area.east),
    );
    const [rows, total] = await Promise.all([
      selectList(this.db)
        .where(where)
        .orderBy(desc(properties.updatedAt), desc(properties.id))
        .limit(limit),
      this.countWhere(where),
    ]);
    return { items: await this.toItems(rows), total };
  }

  private async countWhere(where: SQL | undefined): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(properties).where(where);
    return row?.total ?? 0;
  }

  private filters(c: PanelPropertyFilterCriteria): (SQL | undefined)[] {
    return [
      c.view === 'trash' ? isNotNull(properties.deletedAt) : isNull(properties.deletedAt),
      c.ids === undefined
        ? undefined
        : c.ids.length === 0
          ? sql`false`
          : inArray(properties.id, [...c.ids]),
      // Propiedades de un propietario: `property_owners_client_idx`.
      c.ownerClientId === undefined
        ? undefined
        : sql`exists (select 1 from ${propertyOwners} po where po.property_id = ${properties.id} and po.client_id = ${c.ownerClientId})`,
      // Unidades de un emprendimiento: `properties_development_idx`.
      c.developmentId === undefined ? undefined : eq(properties.developmentId, c.developmentId),
      c.owner.kind === 'producer' ? eq(properties.producerUserId, c.owner.userId) : undefined,
      c.owner.kind === 'branch' ? eq(properties.branchId, c.owner.branchId) : undefined,
      c.text === undefined ? undefined : matchesSearchText(properties.searchText, c.text),
      c.propertyType === undefined ? undefined : eq(properties.propertyType, c.propertyType),
      c.status === undefined ? undefined : eq(properties.status, c.status),
      c.location === undefined
        ? undefined
        : sql`${locationText} like '%' || core.search_normalize(${escapeLike(c.location)}) || '%'`,
      // La operación y el precio salen de `property_operations`: una propiedad puede estar en venta
      // y en alquiler a la vez, cada una con su precio y su moneda.
      c.operation === undefined && c.price === undefined
        ? undefined
        : sql`exists (select 1 from ${propertyOperations} po where ${and(...this.operationMatch(c))})`,
    ];
  }

  /** Condiciones sobre `po` (una operación de la propiedad): operación, moneda y rango de precio. */
  private operationMatch(c: PanelPropertyFilterCriteria): (SQL | undefined)[] {
    return [
      sql`po.property_id = ${properties.id}`,
      c.operation === undefined ? undefined : sql`po.operation = ${c.operation}`,
      c.price === undefined ? undefined : sql`po.currency = ${c.price.currency}`,
      c.price?.minCents === undefined ? undefined : sql`po.price_cents >= ${c.price.minCents}`,
      c.price?.maxCents === undefined ? undefined : sql`po.price_cents <= ${c.price.maxCents}`,
    ];
  }

  private order(c: PanelPropertyListCriteria): SQL[] {
    const { field, direction } = c.sort;
    const tiebreak = by(direction, properties.id);
    switch (field) {
      case 'updatedAt':
        return [by(direction, properties.updatedAt), tiebreak];
      case 'createdAt':
        return [by(direction, properties.createdAt), tiebreak];
      case 'code':
        return [by(direction, properties.code), tiebreak];
      case 'price': {
        // El precio más bajo de la propiedad en la moneda elegida (y en la operación, si hay).
        // El contract exige moneda para ordenar por precio; sin precio, al final.
        const price = sql`(select min(po.price_cents) from ${propertyOperations} po where ${and(
          sql`po.property_id = ${properties.id}`,
          c.operation === undefined ? undefined : sql`po.operation = ${c.operation}`,
          c.price === undefined ? undefined : sql`po.currency = ${c.price.currency}`,
        )})`;
        return [sql`${by(direction, price)} nulls last`, tiebreak];
      }
    }
  }

  private async toItems(rows: readonly ListRow[]): Promise<PanelPropertyListItem[]> {
    const operations = await this.operationsOf(rows.map((row) => row.id));
    return rows.map((row): PanelPropertyListItem => {
      const enums = RowEnums.parse(row);
      return {
        id: row.id,
        code: row.code,
        propertyType: enums.propertyType,
        status: enums.status,
        portalTitle: row.portalTitle ?? row.title,
        publishAddress: undefinedIfNull(row.publishAddress),
        floor: undefinedIfNull(row.floor),
        unit: undefinedIfNull(row.unit),
        developmentId: undefinedIfNull(row.developmentId),
        neighborhood: row.neighborhood,
        city: row.city,
        province: row.province,
        operations: operations.get(row.id) ?? [],
        attributes: {
          rooms: undefinedIfNull(row.rooms),
          bedrooms: undefinedIfNull(row.bedrooms),
          bathrooms: undefinedIfNull(row.bathrooms),
          parkingSpaces: undefinedIfNull(row.parkingSpaces),
          ageYears: undefinedIfNull(row.ageYears),
          surfaceTotalM2: undefinedIfNull(row.surfaceTotalM2),
          surfaceCoveredM2: undefinedIfNull(row.surfaceCoveredM2),
        },
        coverImageUrl: undefinedIfNull(row.coverImageUrl),
        coordinates:
          row.latitude === null || row.longitude === null
            ? undefined
            : { latitude: row.latitude, longitude: row.longitude },
        producerUserId: undefinedIfNull(row.producerUserId),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: undefinedIfNull(row.deletedAt),
        deletedBy: undefinedIfNull(row.deletedBy),
      };
    });
  }

  private async operationsOf(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, PanelPropertyOperation[]>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({
        propertyId: propertyOperations.propertyId,
        operation: propertyOperations.operation,
        currency: propertyOperations.currency,
        priceCents: propertyOperations.priceCents,
        priceOnRequest: propertyOperations.priceOnRequest,
      })
      .from(propertyOperations)
      .where(inArray(propertyOperations.propertyId, [...ids]))
      .orderBy(asc(propertyOperations.propertyId), asc(propertyOperations.operation))
      // Como mucho una fila por operación de cada propiedad de la página.
      .limit(ids.length * OPERATIONS.length);

    const byProperty = new Map<string, PanelPropertyOperation[]>();
    for (const row of rows) {
      const list = byProperty.get(row.propertyId) ?? [];
      list.push({
        ...OperationEnums.parse(row),
        priceCents: row.priceOnRequest ? null : row.priceCents,
      });
      byProperty.set(row.propertyId, list);
    }
    return byProperty;
  }
}
