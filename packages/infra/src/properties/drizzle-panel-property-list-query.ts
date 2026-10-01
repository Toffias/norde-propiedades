import {
  CURRENCIES,
  OPERATIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type PanelPropertyListCriteria,
  type PanelPropertyListItem,
  type PanelPropertyListQuery,
  type PanelPropertyOperation,
} from '@norde/core/properties';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { properties, propertyOperations } from '../db/schema';
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

function by(direction: 'asc' | 'desc', expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

/**
 * Buscador de propiedades del panel. Cada filtro y orden tiene su índice (ver `schema/properties.ts`
 * y la migración 0008); el test de integración lo cubre con 5.000 propiedades.
 */
export class DrizzlePanelPropertyListQuery implements PanelPropertyListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: PanelPropertyListCriteria): Promise<PageSlice<PanelPropertyListItem>> {
    const where = and(...this.filters(criteria));
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: properties.id,
          code: properties.code,
          propertyType: properties.propertyType,
          status: properties.status,
          title: properties.title,
          portalTitle: properties.portalTitle,
          publishAddress: properties.publishAddress,
          neighborhood: properties.neighborhood,
          city: properties.city,
          producerUserId: properties.producerUserId,
          createdAt: properties.createdAt,
          updatedAt: properties.updatedAt,
          deletedAt: properties.deletedAt,
          deletedBy: properties.deletedBy,
        })
        .from(properties)
        .where(where)
        .orderBy(...this.order(criteria))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(properties).where(where),
    ]);

    const operations = await this.operationsOf(rows.map((row) => row.id));
    const items = rows.map((row): PanelPropertyListItem => {
      const enums = RowEnums.parse(row);
      return {
        id: row.id,
        code: row.code,
        propertyType: enums.propertyType,
        status: enums.status,
        portalTitle: row.portalTitle ?? row.title,
        publishAddress: row.publishAddress ?? undefined,
        neighborhood: row.neighborhood,
        city: row.city,
        operations: operations.get(row.id) ?? [],
        producerUserId: row.producerUserId ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt ?? undefined,
        deletedBy: row.deletedBy ?? undefined,
      };
    });
    return { items, total: totals[0]?.total ?? 0 };
  }

  private filters(c: PanelPropertyListCriteria): (SQL | undefined)[] {
    return [
      c.view === 'trash' ? isNotNull(properties.deletedAt) : isNull(properties.deletedAt),
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
  private operationMatch(c: PanelPropertyListCriteria): (SQL | undefined)[] {
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
