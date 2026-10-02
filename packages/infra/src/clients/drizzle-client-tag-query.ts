import type {
  ClientTagGroupRow,
  ClientTagQuery,
  ClientTagRef,
  ClientTagRow,
} from '@norde/core/clients';
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

import type { DbExecutor } from '../db/executor';
import { clients, clientTagAssignments, clientTagGroups, clientTags } from '../db/schema';

type Direction = 'asc' | 'desc';

function by(direction: Direction, expression: SQL | AnyColumn): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Contiene el texto, sin acentos ni mayúsculas (índice trigram sobre la expresión). */
function contains(column: AnyColumn, text: string): SQL {
  return sql`core.search_normalize(${column}) like '%' || core.search_normalize(${escapeLike(text)}) || '%'`;
}

// Columnas de la fila exterior en una subconsulta del `select` (drizzle no las califica ahí).
const outerGroupId = sql.raw('"client_tag_groups"."id"');
const outerTagId = sql.raw('"client_tags"."id"');

/** Catálogo de etiquetas de contactos, con sus contadores (contactos activos, no los borrados). */
export class DrizzleClientTagQuery implements ClientTagQuery {
  constructor(private readonly db: DbExecutor) {}

  async listGroups(
    criteria: Parameters<ClientTagQuery['listGroups']>[0],
  ): Promise<PageSlice<ClientTagGroupRow>> {
    const { field, direction } = criteria.sort;
    const where =
      criteria.text === undefined ? undefined : contains(clientTagGroups.name, criteria.text);
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: clientTagGroups.id,
          name: clientTagGroups.name,
          position: clientTagGroups.position,
          // Índice `client_tags_group_idx`.
          tagCount: sql<number>`(select count(*)::int from ${clientTags} t where t.group_id = ${outerGroupId})`,
          // Índices `client_tags_group_idx` y `client_tag_assignments_tag_idx`.
          clientCount: sql<number>`(
            select count(distinct a.client_id)::int
            from ${clientTags} t
            join ${clientTagAssignments} a on a.tag_id = t.id
            join ${clients} c on c.id = a.client_id and c.deleted_at is null
            where t.group_id = ${outerGroupId}
          )`,
        })
        .from(clientTagGroups)
        .where(where)
        .orderBy(
          by(direction, field === 'name' ? clientTagGroups.name : clientTagGroups.position),
          by(direction, clientTagGroups.id),
        )
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(clientTagGroups).where(where),
    ]);
    return { items: rows, total: totals[0]?.total ?? 0 };
  }

  async searchTags(
    criteria: Parameters<ClientTagQuery['searchTags']>[0],
  ): Promise<PageSlice<ClientTagRow>> {
    const where = and(
      criteria.text === undefined ? undefined : contains(clientTags.name, criteria.text),
      criteria.groupId === undefined
        ? undefined
        : criteria.groupId === null
          ? isNull(clientTags.groupId)
          : eq(clientTags.groupId, criteria.groupId),
    );
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: clientTags.id,
          name: clientTags.name,
          groupId: clientTags.groupId,
          groupName: clientTagGroups.name,
          // Índice `client_tag_assignments_tag_idx`.
          clients: sql<number>`(
            select count(*)::int
            from ${clientTagAssignments} a
            join ${clients} c on c.id = a.client_id and c.deleted_at is null
            where a.tag_id = ${outerTagId}
          )`,
        })
        .from(clientTags)
        .leftJoin(clientTagGroups, eq(clientTagGroups.id, clientTags.groupId))
        .where(where)
        .orderBy(by(criteria.direction, clientTags.name), by(criteria.direction, clientTags.id))
        .limit(criteria.limit)
        .offset(criteria.offset),
      this.db.select({ total: count() }).from(clientTags).where(where),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        groupId: row.groupId ?? undefined,
        groupName: row.groupName ?? undefined,
        clients: row.clients,
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  async refs(ids: readonly string[]): Promise<ClientTagRef[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: clientTags.id, name: clientTags.name, groupName: clientTagGroups.name })
      .from(clientTags)
      .leftJoin(clientTagGroups, eq(clientTagGroups.id, clientTags.groupId))
      .where(inArray(clientTags.id, [...ids]))
      .orderBy(asc(clientTagGroups.position), asc(clientTags.name))
      // El contacto tiene como mucho `MAX_TAGS_PER_CLIENT`.
      .limit(ids.length);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      groupName: row.groupName ?? undefined,
    }));
  }
}
