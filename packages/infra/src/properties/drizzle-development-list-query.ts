import {
  CONSTRUCTION_STATUSES,
  DEVELOPMENT_KINDS,
  DEVELOPMENT_STATUSES,
  type DevelopmentListCriteria,
  type DevelopmentListItem,
  type DevelopmentListQuery,
  type DevelopmentTagRef,
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
import { developments, developmentTagAssignments, properties, propertyTags } from '../db/schema';
import { matchesSearchText } from '../db/text-search';

const RowEnums = z.object({
  developmentType: z.enum(DEVELOPMENT_KINDS).nullable(),
  status: z.enum(DEVELOPMENT_STATUSES),
  constructionStatus: z.enum(CONSTRUCTION_STATUSES).nullable(),
});

/** Columna de la fila exterior dentro de una subconsulta del `select` (drizzle no la califica). */
const outerDevelopmentId = sql.raw('"developments"."id"');

/** Unidades activas, por `properties_development_idx`. */
const unitCount = sql<number>`(
  select count(*)::int from ${properties} p
  where p.development_id = ${outerDevelopmentId} and p.deleted_at is null
)`;

const listColumns = {
  id: developments.id,
  code: developments.code,
  name: developments.name,
  developmentType: developments.developmentType,
  status: developments.status,
  constructionStatus: developments.constructionStatus,
  publishAddress: developments.publishAddress,
  deliveryDate: developments.deliveryDate,
  websiteUrl: developments.websiteUrl,
  unitCount,
  updatedAt: developments.updatedAt,
  deletedAt: developments.deletedAt,
  deletedBy: developments.deletedBy,
};

/** Más etiquetas que esto no entran en una fila del listado. */
const MAX_TAGS_PER_ROW = 20;

function by(direction: 'asc' | 'desc', expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

const undefinedIfNull = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * Listado de emprendimientos del panel. Cada filtro y orden tiene su índice (`schema/properties.ts`,
 * migraciones 0001 y 0023); el test de integración lo cubre.
 */
export class DrizzleDevelopmentListQuery implements DevelopmentListQuery {
  constructor(private readonly db: DbExecutor) {}

  async search(criteria: DevelopmentListCriteria): Promise<PageSlice<DevelopmentListItem>> {
    const where = and(...this.filters(criteria));
    const [rows, total] = await Promise.all([
      this.db
        .select(listColumns)
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
    const tags = await this.tagsOf(rows.map((row) => row.id));
    const items = rows.map((row): DevelopmentListItem => {
      const enums = RowEnums.parse(row);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        developmentType: undefinedIfNull(enums.developmentType),
        status: enums.status,
        constructionStatus: undefinedIfNull(enums.constructionStatus),
        publishAddress: undefinedIfNull(row.publishAddress),
        deliveryDate: undefinedIfNull(row.deliveryDate),
        websiteUrl: undefinedIfNull(row.websiteUrl),
        tags: tags.get(row.id) ?? [],
        unitCount: row.unitCount,
        updatedAt: row.updatedAt,
        deletedAt: undefinedIfNull(row.deletedAt),
        deletedBy: undefinedIfNull(row.deletedBy),
      };
    });
    return { items, total };
  }

  private filters(c: DevelopmentListCriteria): (SQL | undefined)[] {
    return [
      c.view === 'trash' ? isNotNull(developments.deletedAt) : isNull(developments.deletedAt),
      c.text === undefined ? undefined : matchesSearchText(developments.searchText, c.text),
      c.status === undefined ? undefined : eq(developments.status, c.status),
      c.developmentType === undefined
        ? undefined
        : eq(developments.developmentType, c.developmentType),
      c.constructionStatus === undefined
        ? undefined
        : eq(developments.constructionStatus, c.constructionStatus),
      // Por la clave (development_id, tag_id) de `development_tag_assignments`.
      c.tagId === undefined
        ? undefined
        : sql`exists (select 1 from ${developmentTagAssignments} dt where dt.development_id = ${developments.id} and dt.tag_id = ${c.tagId})`,
    ];
  }

  private order(c: DevelopmentListCriteria): SQL[] {
    const { field, direction } = c.sort;
    const tiebreak = by(direction, developments.id);
    switch (field) {
      case 'updatedAt':
        return [by(direction, developments.updatedAt), tiebreak];
      case 'name':
        return [by(direction, developments.name), tiebreak];
      case 'code':
        return [by(direction, developments.code), tiebreak];
      case 'deliveryDate':
        // Sin fecha de entrega, al final.
        return [sql`${by(direction, developments.deliveryDate)} nulls last`, tiebreak];
    }
  }

  /** Las etiquetas de los emprendimientos de la página, con su nombre. */
  private async tagsOf(ids: readonly string[]): Promise<Map<string, DevelopmentTagRef[]>> {
    const byDevelopment = new Map<string, DevelopmentTagRef[]>();
    if (ids.length === 0) return byDevelopment;
    const rows = await this.db
      .select({
        developmentId: developmentTagAssignments.developmentId,
        id: propertyTags.id,
        name: propertyTags.name,
      })
      .from(developmentTagAssignments)
      .innerJoin(propertyTags, eq(propertyTags.id, developmentTagAssignments.tagId))
      .where(inArray(developmentTagAssignments.developmentId, [...ids]))
      .orderBy(asc(propertyTags.name))
      .limit(ids.length * MAX_TAGS_PER_ROW);
    for (const row of rows) {
      const list = byDevelopment.get(row.developmentId) ?? [];
      if (list.length < MAX_TAGS_PER_ROW) list.push({ id: row.id, name: row.name });
      byDevelopment.set(row.developmentId, list);
    }
    return byDevelopment;
  }
}
