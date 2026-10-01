import {
  CURRENCIES,
  OPERATIONS,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type PropertyRecord,
  type PropertySearchCriteria,
  type PropertySearchQuery,
} from '@norde/core/properties';
import { and, asc, count, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { properties } from '../db/schema';

// Columnas `text` de la base → uniones del core. Si alguien carga un valor fuera de catálogo,
// falla fuerte en lugar de propagar un tipo mentiroso.
const RowEnums = z.object({
  operation: z.enum(OPERATIONS),
  propertyType: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
  currency: z.enum(CURRENCIES),
});

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

export class DrizzlePropertySearchQuery implements PropertySearchQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: PropertySearchCriteria) {
    const where = and(...this.filters(criteria));
    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(properties)
        .where(where)
        // Destacadas primero; después las más nuevas.
        .orderBy(
          sql`${properties.featured} desc`,
          sql`${properties.createdAt} desc`,
          asc(properties.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(properties).where(where),
    ]);
    return { items: rows.map(toRecord), total: totals[0]?.total ?? 0 };
  }

  async findById(id: string) {
    const [row] = await this.db
      .select()
      .from(properties)
      .where(and(eq(properties.id, id), isNull(properties.deletedAt)))
      .limit(1);
    return row && toRecord(row);
  }

  private filters(c: PropertySearchCriteria): (SQL | undefined)[] {
    const location = c.location === undefined ? [] : this.locationWords(c.location);
    const place = sql`${properties.neighborhood} || ' ' || ${properties.city} || ' ' || coalesce(${properties.address}, '')`;

    return [
      // Las de la papelera no existen para la web ni para el agente.
      isNull(properties.deletedAt),
      inArray(properties.status, [...c.statuses]),
      c.publishedOnWebOnly ? eq(properties.publishedOnWeb, true) : undefined,
      c.operation === undefined ? undefined : eq(properties.operation, c.operation),
      c.propertyType === undefined ? undefined : eq(properties.propertyType, c.propertyType),
      c.currency === undefined ? undefined : eq(properties.currency, c.currency),
      c.minPriceCents === undefined ? undefined : gte(properties.priceCents, c.minPriceCents),
      c.maxPriceCents === undefined ? undefined : lte(properties.priceCents, c.maxPriceCents),
      c.minRooms === undefined ? undefined : gte(properties.rooms, c.minRooms),
      c.maxRooms === undefined ? undefined : lte(properties.rooms, c.maxRooms),
      c.minBedrooms === undefined ? undefined : gte(properties.bedrooms, c.minBedrooms),
      c.minSurfaceM2 === undefined ? undefined : gte(properties.surfaceTotalM2, c.minSurfaceM2),
      // "Palermo Soho", "Vicente López": alcanza con que coincida alguna palabra.
      location.length === 0 ? undefined : or(...location.map((w) => contains(place, w))),
      ...(c.amenities ?? []).map((amenity) => {
        const term = normalizeTerm(amenity);
        // Coincidencia parcial en los dos sentidos: "pileta" ~ "pileta climatizada".
        return sql`exists (select 1 from unnest(${properties.amenities}) as a(name) where ${contains(sql`a.name`, term)} or ${term} like '%' || ${normalized(sql`a.name`)} || '%')`;
      }),
    ];
  }

  private locationWords(location: string): string[] {
    return normalizeTerm(location)
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }
}

function toRecord(row: typeof properties.$inferSelect): PropertyRecord {
  const enums = RowEnums.parse(row);
  return {
    id: row.id,
    code: row.code,
    slug: row.slug,
    title: row.title,
    description: row.description,
    ...enums,
    publishedOnWeb: row.publishedOnWeb,
    address: row.address,
    showExactAddress: row.showExactAddress,
    neighborhood: row.neighborhood,
    city: row.city,
    priceCents: row.priceCents,
    expensesCents: row.expensesCents,
    rooms: row.rooms,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    surfaceTotalM2: row.surfaceTotalM2,
    surfaceCoveredM2: row.surfaceCoveredM2,
    amenities: row.amenities,
    imageUrls: row.imageUrls,
  };
}
