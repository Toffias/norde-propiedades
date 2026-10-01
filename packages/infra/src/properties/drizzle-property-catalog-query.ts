import { FEATURE_KINDS, LOCATION_KINDS, type PropertyCatalogQuery } from '@norde/core/properties';
import type {
  FavoriteSearchRow,
  FeatureRow,
  LocationRow,
  TagGroupRow,
  TagRow,
} from '@norde/core/properties';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import {
  developmentTagAssignments,
  favoritePropertySearches,
  features,
  locations,
  propertyTagAssignments,
  propertyTagGroups,
  propertyTags,
} from '../db/schema';

import { readGridColumns, readTypeSettings } from './drizzle-catalog-repositories';

type Direction = 'asc' | 'desc';

function by(direction: Direction, expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Contiene el texto, sin acentos ni mayúsculas. `expression` ya está normalizada e indexada. */
function contains(expression: SQL | AnyColumn, text: string): SQL {
  return sql`${expression} like '%' || core.search_normalize(${escapeLike(text)}) || '%'`;
}

/** Columna de la fila exterior en una subconsulta del `select` (drizzle no la califica ahí). */
const outerTagId = sql.raw('"property_tags"."id"');

const LocationKind = z.enum(LOCATION_KINDS);
const FeatureKind = z.enum(FEATURE_KINDS);
const Params = z.record(z.string(), z.string());

/** Lecturas paginadas de los catálogos de propiedades. Cada filtro y orden tiene su índice (0009). */
export class DrizzlePropertyCatalogQuery implements PropertyCatalogQuery {
  constructor(private readonly db: DbExecutor) {}

  async searchLocations(
    criteria: Parameters<PropertyCatalogQuery['searchLocations']>[0],
  ): Promise<PageSlice<LocationRow>> {
    const where = and(
      criteria.text === undefined ? undefined : contains(locations.normalizedName, criteria.text),
      criteria.parentId === undefined ? undefined : eq(locations.parentId, criteria.parentId),
      criteria.kind === undefined ? undefined : eq(locations.kind, criteria.kind),
    );
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: locations.id,
          kind: locations.kind,
          name: locations.name,
          parentId: locations.parentId,
          path: locations.path,
        })
        .from(locations)
        .where(where)
        .orderBy(by(criteria.direction, locations.name), by(criteria.direction, locations.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(locations).where(where),
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
        parentId: row.parentId ?? undefined,
        ancestors: (lineages[index] ?? []).flatMap((id) => {
          const name = names.get(id);
          return name === undefined ? [] : [name];
        }),
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  async listFeatures(
    criteria: Parameters<PropertyCatalogQuery['listFeatures']>[0],
  ): Promise<PageSlice<FeatureRow>> {
    const where = and(
      eq(features.kind, criteria.kind),
      criteria.text === undefined
        ? undefined
        : contains(sql`core.search_normalize(${features.name})`, criteria.text),
      criteria.active === undefined ? undefined : eq(features.isActive, criteria.active),
    );
    const { field, direction } = criteria.sort;
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: features.id,
          kind: features.kind,
          key: features.key,
          name: features.name,
          position: features.position,
          isActive: features.isActive,
        })
        .from(features)
        .where(where)
        .orderBy(
          by(direction, field === 'name' ? features.name : features.position),
          by(direction, features.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(features).where(where),
    ]);
    return {
      items: rows.map((row) => ({ ...row, kind: FeatureKind.parse(row.kind) })),
      total: totals[0]?.total ?? 0,
    };
  }

  async listTagGroups(
    criteria: Parameters<PropertyCatalogQuery['listTagGroups']>[0],
  ): Promise<PageSlice<TagGroupRow>> {
    const { field, direction } = criteria.sort;
    const where =
      criteria.text === undefined
        ? undefined
        : contains(sql`core.search_normalize(${propertyTagGroups.name})`, criteria.text);
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: propertyTagGroups.id,
          name: propertyTagGroups.name,
          position: propertyTagGroups.position,
          // Índice `property_tags_group_idx`.
          tagCount: sql<number>`(select count(*)::int from ${propertyTags} t where t.group_id = ${sql.raw('"property_tag_groups"."id"')})`,
        })
        .from(propertyTagGroups)
        .where(where)
        .orderBy(
          by(direction, field === 'name' ? propertyTagGroups.name : propertyTagGroups.position),
          by(direction, propertyTagGroups.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(propertyTagGroups).where(where),
    ]);
    return { items: rows, total: totals[0]?.total ?? 0 };
  }

  async searchTags(
    criteria: Parameters<PropertyCatalogQuery['searchTags']>[0],
  ): Promise<PageSlice<TagRow>> {
    const where = and(
      criteria.text === undefined
        ? undefined
        : contains(sql`core.search_normalize(${propertyTags.name})`, criteria.text),
      criteria.groupId === undefined
        ? undefined
        : criteria.groupId === null
          ? isNull(propertyTags.groupId)
          : eq(propertyTags.groupId, criteria.groupId),
    );
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: propertyTags.id,
          name: propertyTags.name,
          groupId: propertyTags.groupId,
          groupName: propertyTagGroups.name,
          // Índices `property_tag_assignments_tag_idx` y `development_tag_assignments_tag_idx`.
          uses: sql<number>`(
            (select count(*)::int from ${propertyTagAssignments} a where a.tag_id = ${outerTagId})
            + (select count(*)::int from ${developmentTagAssignments} d where d.tag_id = ${outerTagId})
          )`,
        })
        .from(propertyTags)
        .leftJoin(propertyTagGroups, eq(propertyTagGroups.id, propertyTags.groupId))
        .where(where)
        .orderBy(by(criteria.direction, propertyTags.name), by(criteria.direction, propertyTags.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(propertyTags).where(where),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        groupId: row.groupId ?? undefined,
        groupName: row.groupName ?? undefined,
        uses: row.uses,
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  async listFavoriteSearches(
    criteria: Parameters<PropertyCatalogQuery['listFavoriteSearches']>[0],
  ): Promise<PageSlice<FavoriteSearchRow>> {
    const where = eq(favoritePropertySearches.userId, criteria.userId);
    const { field, direction } = criteria.sort;
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: favoritePropertySearches.id,
          name: favoritePropertySearches.name,
          params: favoritePropertySearches.params,
          updatedAt: favoritePropertySearches.updatedAt,
        })
        .from(favoritePropertySearches)
        .where(where)
        .orderBy(
          by(
            direction,
            field === 'name' ? favoritePropertySearches.name : favoritePropertySearches.updatedAt,
          ),
          by(direction, favoritePropertySearches.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(favoritePropertySearches).where(where),
    ]);
    return {
      items: rows.map((row) => ({ ...row, params: Params.parse(row.params) })),
      total: totals[0]?.total ?? 0,
    };
  }

  typeSettings() {
    return readTypeSettings(this.db);
  }

  gridColumns() {
    return readGridColumns(this.db);
  }
}
