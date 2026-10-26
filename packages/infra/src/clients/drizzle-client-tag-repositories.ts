import {
  ClientTag,
  ClientTagGroup,
  type ClientTagGroupId,
  type ClientTagGroupRepository,
  type ClientTagId,
  type ClientTagRepository,
  type MovedTagAssignment,
} from '@norde/core/clients';
import { parseId, type Result } from '@norde/core/shared';
import { and, count, eq, inArray, isNull, max, sql, type SQL } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import { clientTagAssignments, clientTagGroups, clientTags } from '../db/schema';

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the client tags');
  return result.value;
}

export class DrizzleClientTagGroupRepository implements ClientTagGroupRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: ClientTagGroupId) {
    return this.findOneWhere(eq(clientTagGroups.id, id));
  }

  findByName(name: string) {
    // Mismo nombre sin acentos ni mayúsculas: "Orígen" y "origen" son el mismo grupo.
    return this.findOneWhere(
      sql`core.search_normalize(${clientTagGroups.name}) = core.search_normalize(${name.trim()})`,
    );
  }

  async nextPosition(): Promise<number> {
    const [row] = await this.db
      .select({ last: max(clientTagGroups.position) })
      .from(clientTagGroups);
    return row?.last === null || row?.last === undefined ? 0 : row.last + 1;
  }

  async countTags(id: ClientTagGroupId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(clientTags)
      .where(eq(clientTags.groupId, id));
    return row?.total ?? 0;
  }

  async save(group: ClientTagGroup, actorId: string): Promise<void> {
    const s = group.toSnapshot();
    const values = {
      name: s.name,
      position: s.position,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(clientTagGroups)
      .values({ id: s.id, createdAt: s.createdAt, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: clientTagGroups.id, set: values });
  }

  async delete(id: ClientTagGroupId): Promise<void> {
    await this.db.delete(clientTagGroups).where(eq(clientTagGroups.id, id));
  }

  private async findOneWhere(where: SQL | undefined): Promise<ClientTagGroup | undefined> {
    const [row] = await this.db.select().from(clientTagGroups).where(where).limit(1);
    if (!row) return undefined;
    return ClientTagGroup.restore({
      id: stored(parseId<'ClientTagGroup'>(row.id)),
      name: row.name,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

export class DrizzleClientTagRepository implements ClientTagRepository {
  constructor(private readonly db: DbExecutor) {}

  findById(id: ClientTagId) {
    return this.findOneWhere(eq(clientTags.id, id));
  }

  findInGroup(groupId: ClientTagGroupId | undefined, name: string) {
    return this.findOneWhere(
      and(
        groupId === undefined ? isNull(clientTags.groupId) : eq(clientTags.groupId, groupId),
        // Misma expresión que `client_tags_group_name_uq`.
        sql`lower(${clientTags.name}) = lower(${name.trim()})`,
      ),
    );
  }

  async findExistingIds(ids: readonly string[]): Promise<readonly string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({ id: clientTags.id })
      .from(clientTags)
      .where(inArray(clientTags.id, [...ids]));
    return rows.map((row) => row.id);
  }

  async countUses(id: ClientTagId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(clientTagAssignments)
      .where(eq(clientTagAssignments.tagId, id));
    return row?.total ?? 0;
  }

  async moveAssignments(
    source: ClientTagId,
    target: ClientTagId,
    limit: number,
    actorId: string,
    now: Date,
  ): Promise<readonly MovedTagAssignment[]> {
    // De a un lote: los movidos ya no tienen `source`, así que la próxima llamada sigue con otros.
    const batch = await this.db
      .select({ clientId: clientTagAssignments.clientId })
      .from(clientTagAssignments)
      .where(eq(clientTagAssignments.tagId, source))
      .orderBy(clientTagAssignments.clientId)
      .limit(limit);
    const clientIds = batch.map((row) => row.clientId);
    if (clientIds.length === 0) return [];

    const assigned = await this.db
      .select({ clientId: clientTagAssignments.clientId, tagId: clientTagAssignments.tagId })
      .from(clientTagAssignments)
      .where(inArray(clientTagAssignments.clientId, clientIds));
    await this.db
      .insert(clientTagAssignments)
      .values(
        clientIds.map((clientId) => ({
          clientId,
          tagId: target,
          createdAt: now,
          createdBy: actorId,
        })),
      )
      .onConflictDoNothing();
    await this.db
      .delete(clientTagAssignments)
      .where(
        and(
          eq(clientTagAssignments.tagId, source),
          inArray(clientTagAssignments.clientId, clientIds),
        ),
      );
    const before = new Map<string, string[]>();
    for (const row of assigned)
      before.set(row.clientId, [...(before.get(row.clientId) ?? []), row.tagId]);
    return clientIds.map((clientId) => ({ clientId, tagIdsBefore: before.get(clientId) ?? [] }));
  }

  async save(tag: ClientTag, actorId: string): Promise<void> {
    const s = tag.toSnapshot();
    const values = {
      name: s.name,
      groupId: s.groupId ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(clientTags)
      .values({ id: s.id, createdAt: s.createdAt, createdBy: actorId, ...values })
      .onConflictDoUpdate({ target: clientTags.id, set: values });
  }

  async delete(id: ClientTagId): Promise<void> {
    await this.db.delete(clientTags).where(eq(clientTags.id, id));
  }

  private async findOneWhere(where: SQL | undefined): Promise<ClientTag | undefined> {
    const [row] = await this.db.select().from(clientTags).where(where).limit(1);
    if (!row) return undefined;
    return ClientTag.restore({
      id: stored(parseId<'ClientTag'>(row.id)),
      groupId: row.groupId === null ? undefined : stored(parseId<'ClientTagGroup'>(row.groupId)),
      name: row.name,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
