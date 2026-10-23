import {
  LOCATION_KINDS,
  type PublicLocationCriteria,
  type PublicLocationQuery,
  type PublicLocationRecord,
} from '@norde/core/properties';
import type { PageSlice } from '@norde/core/shared';
import { and, count, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { locations, properties, propertyOperations } from '../db/schema';

const LocationKind = z.enum(LOCATION_KINDS);

/**
 * Ubicaciones del catálogo con propiedades publicadas (autocompletado de la web). Una propiedad
 * cuenta para su ubicación y para todos sus ancestros: su ruta materializada contiene sus IDs.
 * El catálogo tiene cientos de filas y la cartera, cientos de propiedades: se agrupa en la base.
 */
export class DrizzlePublicLocationQuery implements PublicLocationQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: PublicLocationCriteria): Promise<PageSlice<PublicLocationRecord>> {
    const place = alias(locations, 'place');
    const listed = and(
      isNull(properties.deletedAt),
      eq(properties.publishedOnWeb, true),
      inArray(properties.status, [...criteria.statuses]),
      sql`exists (select 1 from ${propertyOperations} where ${propertyOperations.propertyId} = ${properties.id})`,
    );
    const text =
      criteria.text === undefined ? undefined : sql`core.search_normalize(${criteria.text})`;
    const where = and(
      ne(locations.kind, 'country'),
      // La ciudad "CABA" dentro de la provincia "CABA" es la misma zona: se ofrece una sola vez.
      criteria.ids === undefined
        ? sql`not exists (select 1 from ${locations} as parent where parent.id = ${locations.parentId} and parent.normalized_name = ${locations.normalizedName})`
        : undefined,
      text === undefined
        ? undefined
        : sql`${locations.normalizedName} like '%' || ${escapeLikeSql(text)} || '%'`,
      criteria.ids === undefined ? undefined : inArray(locations.id, [...criteria.ids]),
    );
    const listingCount = sql<number>`count(distinct ${properties.id})::int`;

    const grouped = this.db
      .select({
        id: locations.id,
        kind: locations.kind,
        name: locations.name,
        path: locations.path,
        normalizedName: locations.normalizedName,
        listingCount: listingCount.as('listing_count'),
      })
      .from(locations)
      .innerJoin(place, sql`${place.path} like ${locations.path} || '%'`)
      .innerJoin(properties, and(eq(properties.locationId, place.id), listed))
      .where(where)
      .groupBy(locations.id)
      .as('grouped');

    const relevance: SQL[] =
      text === undefined
        ? []
        : [
            sql`case when ${grouped.normalizedName} = ${text} then 0 when ${grouped.normalizedName} like ${escapeLikeSql(text)} || '%' then 1 when ${grouped.normalizedName} like '% ' || ${escapeLikeSql(text)} || '%' then 2 else 3 end`,
          ];

    const [rows, totals] = await Promise.all([
      this.db
        .select()
        .from(grouped)
        .orderBy(
          ...relevance,
          sql`${grouped.listingCount} desc`,
          sql`${grouped.name} asc`,
          sql`${grouped.id} asc`,
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(grouped),
    ]);

    // Los ancestros de la página, en una sola consulta: como mucho cinco niveles por fila.
    const lineages = rows.map((row) =>
      row.path.split('/').filter((part) => part !== '' && part !== row.id),
    );
    const ancestorIds = [...new Set(lineages.flat())];
    const names =
      ancestorIds.length === 0
        ? new Map<string, string>()
        : new Map(
            (
              await this.db
                .select({ id: locations.id, name: locations.name })
                .from(locations)
                .where(inArray(locations.id, ancestorIds))
                .limit(ancestorIds.length)
            ).map((row) => [row.id, row.name]),
          );

    return {
      items: rows.map((row, index) => ({
        id: row.id,
        kind: LocationKind.parse(row.kind),
        name: row.name,
        ancestors: (lineages[index] ?? []).flatMap((id) => {
          const name = names.get(id);
          return name === undefined ? [] : [name];
        }),
        listingCount: row.listingCount,
      })),
      total: totals[0]?.total ?? 0,
    };
  }
}

/** El texto ya normalizado en la base, con los comodines de `like` escapados. */
function escapeLikeSql(normalized: SQL): SQL {
  return sql`replace(replace(replace(${normalized}, '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;
}
