import {
  APPRAISAL_CONDITIONS,
  APPRAISAL_PROPERTY_TYPES,
  APPRAISAL_SOURCES,
  APPRAISAL_STATUSES,
  Appraisal,
  type AppraisalCodeSequence,
  type AppraisalId,
  type AppraisalRepository,
  type AppraisalSnapshot,
} from '@norde/core/appraisals';
import { parseId } from '@norde/core/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { appraisals } from '../db/schema';

type AppraisalDbRow = typeof appraisals.$inferSelect;

const StatusSchema = z.enum(APPRAISAL_STATUSES);
const SourceSchema = z.enum(APPRAISAL_SOURCES);
const PropertyTypeSchema = z.enum(APPRAISAL_PROPERTY_TYPES);
const ConditionSchema = z.enum(APPRAISAL_CONDITIONS);
/** `nextval` vuelve como texto (bigint de Postgres). */
const NextValueSchema = z.object({ value: z.coerce.number().int().positive() });

function toId(raw: string): AppraisalId {
  const id = parseId<'Appraisal'>(raw);
  if (id.isErr()) throw new Error(`Invalid appraisal id ${raw}`);
  return id.value;
}

function toSnapshot(row: AppraisalDbRow): AppraisalSnapshot {
  // Las tasaciones del panel siempre tienen solicitante y productor; una sin ellos es un bug.
  if (row.requesterClientId === null || row.producerUserId === null) {
    throw new Error(`Appraisal ${row.id} without requester or producer`);
  }
  return {
    id: toId(row.id),
    code: row.code,
    source: SourceSchema.parse(row.source),
    status: StatusSchema.parse(row.status),
    statusChangedAt: row.statusChangedAt ?? undefined,
    requesterClientId: row.requesterClientId,
    producerUserId: row.producerUserId,
    branchId: row.branchId ?? undefined,
    appraiserUserId: row.appraiserUserId ?? undefined,
    visitAt: row.visitAt ?? undefined,
    propertyType: PropertyTypeSchema.parse(row.propertyType),
    address: row.address ?? undefined,
    surfaceTotalM2: row.surfaceTotalM2 ?? undefined,
    surfaceCoveredM2: row.surfaceCoveredM2 ?? undefined,
    rooms: row.rooms ?? undefined,
    bedrooms: row.bedrooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    condition: row.condition === null ? undefined : ConditionSchema.parse(row.condition),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
    deletedBy: row.deletedBy ?? undefined,
  };
}

/** Lo que cambia de una tasación: todo menos el código, el origen y el alta. */
function changingValues(s: AppraisalSnapshot, actorId: string) {
  return {
    status: s.status,
    statusChangedAt: s.statusChangedAt ?? null,
    requesterClientId: s.requesterClientId,
    producerUserId: s.producerUserId,
    branchId: s.branchId ?? null,
    appraiserUserId: s.appraiserUserId ?? null,
    visitAt: s.visitAt ?? null,
    propertyType: s.propertyType,
    address: s.address ?? null,
    surfaceTotalM2: s.surfaceTotalM2 ?? null,
    surfaceCoveredM2: s.surfaceCoveredM2 ?? null,
    rooms: s.rooms ?? null,
    bedrooms: s.bedrooms ?? null,
    bathrooms: s.bathrooms ?? null,
    condition: s.condition ?? null,
    deletedAt: s.deletedAt ?? null,
    deletedBy: s.deletedBy ?? null,
    updatedAt: s.updatedAt,
    updatedBy: actorId,
  };
}

export class DrizzleAppraisalRepository implements AppraisalRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: AppraisalId): Promise<Appraisal | undefined> {
    const [row] = await this.db.select().from(appraisals).where(eq(appraisals.id, id)).limit(1);
    return row && Appraisal.restore(toSnapshot(row));
  }

  async insert(appraisal: Appraisal, actorId: string): Promise<void> {
    const s = appraisal.toSnapshot();
    await this.db.insert(appraisals).values({
      id: s.id,
      code: s.code,
      source: s.source,
      createdAt: s.createdAt,
      createdBy: actorId,
      ...changingValues(s, actorId),
    });
  }

  async save(appraisal: Appraisal, actorId: string): Promise<void> {
    const s = appraisal.toSnapshot();
    await this.db.update(appraisals).set(changingValues(s, actorId)).where(eq(appraisals.id, s.id));
  }

  async moveRequester(fromClientId: string, toClientId: string): Promise<readonly AppraisalId[]> {
    const moved = await this.db
      .update(appraisals)
      .set({ requesterClientId: toClientId })
      .where(eq(appraisals.requesterClientId, fromClientId))
      .returning({ id: appraisals.id });
    return moved.map((row) => toId(row.id));
  }

  async deleteByRequesters(clientIds: readonly string[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const deleted = await this.db
      .delete(appraisals)
      .where(inArray(appraisals.requesterClientId, [...clientIds]))
      .returning({ id: appraisals.id });
    return deleted.length;
  }
}

/** `nextval` de `core.appraisal_code_seq`: no se repite, aunque la transacción se deshaga. */
export class DrizzleAppraisalCodeSequence implements AppraisalCodeSequence {
  constructor(private readonly db: DbExecutor) {}

  async next(): Promise<number> {
    const result = await this.db.execute(sql`select nextval('core.appraisal_code_seq') as value`);
    return NextValueSchema.parse(result.rows[0]).value;
  }
}
