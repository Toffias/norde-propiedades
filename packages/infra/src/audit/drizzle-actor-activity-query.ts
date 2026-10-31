import type {
  ActorActivityCriteria,
  ActorActivityQuery,
  ActorActivityRecord,
} from '@norde/core/audit';
import type { ActivityEntity } from '@norde/core/audit/contracts';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm';

import type { DbExecutor } from '../db/executor';
import {
  appraisals,
  auditLog,
  clients,
  developments,
  opportunities,
  properties,
  users,
} from '../db/schema';
import { parseHistoryChanges } from './history-changes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntityLabels = ReadonlyMap<string, ActivityEntity>;

function entity(name: string | null, extra: Partial<ActivityEntity> = {}): ActivityEntity {
  return {
    code: undefined,
    name: name ?? undefined,
    clientId: undefined,
    deleted: false,
    ...extra,
  };
}

/**
 * Lo que hizo un usuario sobre `audit_log`, con los índices `(actor_id, occurred_at)` y
 * `(actor_id, entity_type, occurred_at)`. Las entidades se nombran después, solo las de la página.
 */
export class DrizzleActorActivityQuery implements ActorActivityQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(criteria: ActorActivityCriteria): Promise<PageSlice<ActorActivityRecord>> {
    const types = criteria.entityTypes;
    const where = and(
      eq(auditLog.actorId, criteria.actorId),
      types === undefined
        ? undefined
        : 'include' in types
          ? inArray(auditLog.entityType, [...types.include])
          : notInArray(auditLog.entityType, [...types.exclude]),
      criteria.from === undefined ? undefined : gte(auditLog.occurredAt, criteria.from),
      criteria.to === undefined ? undefined : lt(auditLog.occurredAt, criteria.to),
    );
    const order = criteria.direction === 'asc' ? asc : desc;
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: auditLog.id,
          occurredAt: auditLog.occurredAt,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          changes: auditLog.changes,
        })
        .from(auditLog)
        .where(where)
        .orderBy(order(auditLog.occurredAt), order(auditLog.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db.select({ total: count() }).from(auditLog).where(where),
    ]);
    const labels = await this.labelsOf(rows);
    return {
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        entity: labels.get(`${row.entityType}:${row.entityId}`),
        changes: parseHistoryChanges(row.changes),
      })),
      total: totals[0]?.total ?? 0,
    };
  }

  private async labelsOf(
    rows: readonly { readonly entityType: string; readonly entityId: string }[],
  ): Promise<EntityLabels> {
    // `entity_id` es texto: solo los que son UUID pueden ir contra las claves de las tablas.
    const idsOf = (type: string) => [
      ...new Set(
        rows
          .filter((row) => row.entityType === type && UUID.test(row.entityId))
          .map((row) => row.entityId),
      ),
    ];
    const groups = await Promise.all([
      this.label('property', idsOf('property'), (ids) =>
        this.db
          .select({
            id: properties.id,
            code: properties.code,
            name: sql<string>`coalesce(${properties.portalTitle}, ${properties.title})`,
            deletedAt: properties.deletedAt,
          })
          .from(properties)
          .where(inArray(properties.id, ids))
          .limit(ids.length)
          .then((found) =>
            found.map((row) => ({
              id: row.id,
              entity: entity(row.name, { code: row.code, deleted: row.deletedAt !== null }),
            })),
          ),
      ),
      this.label('development', idsOf('development'), (ids) =>
        this.db
          .select({
            id: developments.id,
            code: developments.code,
            name: developments.name,
            deletedAt: developments.deletedAt,
          })
          .from(developments)
          .where(inArray(developments.id, ids))
          .limit(ids.length)
          .then((found) =>
            found.map((row) => ({
              id: row.id,
              entity: entity(row.name, { code: row.code, deleted: row.deletedAt !== null }),
            })),
          ),
      ),
      this.label('client', idsOf('client'), (ids) =>
        this.db
          .select({ id: clients.id, name: clients.name, deletedAt: clients.deletedAt })
          .from(clients)
          .where(inArray(clients.id, ids))
          .limit(ids.length)
          .then((found) =>
            found.map((row) => ({
              id: row.id,
              entity: entity(row.name, { deleted: row.deletedAt !== null }),
            })),
          ),
      ),
      this.label('opportunity', idsOf('opportunity'), (ids) =>
        this.db
          .select({
            id: opportunities.id,
            clientId: opportunities.clientId,
            name: clients.name,
            deletedAt: clients.deletedAt,
          })
          .from(opportunities)
          .innerJoin(clients, eq(clients.id, opportunities.clientId))
          .where(inArray(opportunities.id, ids))
          .limit(ids.length)
          .then((found) =>
            found.map((row) => ({
              id: row.id,
              entity: entity(row.name, {
                clientId: row.clientId,
                deleted: row.deletedAt !== null,
              }),
            })),
          ),
      ),
      this.label('appraisal', idsOf('appraisal'), (ids) =>
        this.db
          .select({
            id: appraisals.id,
            code: appraisals.code,
            name: appraisals.address,
            deletedAt: appraisals.deletedAt,
          })
          .from(appraisals)
          .where(inArray(appraisals.id, ids))
          .limit(ids.length)
          .then((found) =>
            found.map((row) => ({
              id: row.id,
              entity: entity(row.name, { code: row.code, deleted: row.deletedAt !== null }),
            })),
          ),
      ),
      this.label('user', idsOf('user'), (ids) =>
        this.db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, ids))
          .limit(ids.length)
          .then((found) => found.map((row) => ({ id: row.id, entity: entity(row.name) }))),
      ),
    ]);
    return new Map(groups.flat());
  }

  private async label(
    type: string,
    ids: string[],
    load: (ids: string[]) => Promise<{ readonly id: string; readonly entity: ActivityEntity }[]>,
  ): Promise<(readonly [string, ActivityEntity])[]> {
    if (ids.length === 0) return [];
    const found = await load(ids);
    return found.map((row) => [`${type}:${row.id}`, row.entity] as const);
  }
}
