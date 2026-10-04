import {
  APPRAISAL_CONDITIONS,
  APPRAISAL_PROPERTY_TYPES,
  APPRAISAL_SOURCES,
  APPRAISAL_STATUSES,
  Appraisal,
  type AppraisalCodeSequence,
  type AppraisalId,
  type AppraisalPhoto,
  type AppraisalPhotoId,
  type AppraisalPhotoRepository,
  type AppraisalRepository,
  type AppraisalSnapshot,
  type ErasedAppraisals,
} from '@norde/core/appraisals';
import { parseId } from '@norde/core/shared';
import { asc, count, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { appraisalPhotos, appraisals } from '../db/schema';

import { resultColumns, resultFromRow } from './appraisal-result-columns';

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
    result: resultFromRow(row),
    convertedPropertyId: row.convertedPropertyId ?? undefined,
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
    ...resultColumns(s.result),
    convertedPropertyId: s.convertedPropertyId ?? null,
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

  async deleteByRequesters(clientIds: readonly string[], limit: number): Promise<ErasedAppraisals> {
    if (clientIds.length === 0) return { deleted: 0, photoKeys: [] };
    const batch = await this.db
      .select({ id: appraisals.id })
      .from(appraisals)
      .where(inArray(appraisals.requesterClientId, [...clientIds]))
      .orderBy(asc(appraisals.id))
      .limit(limit);
    if (batch.length === 0) return { deleted: 0, photoKeys: [] };
    const ids = batch.map((row) => row.id);
    // Las fotos se irían por cascada; se borran antes para devolver sus claves de storage.
    const photos = await this.db
      .delete(appraisalPhotos)
      .where(inArray(appraisalPhotos.appraisalId, ids))
      .returning({ storageKey: appraisalPhotos.storageKey });
    const deleted = await this.db
      .delete(appraisals)
      .where(inArray(appraisals.id, ids))
      .returning({ id: appraisals.id });
    return { deleted: deleted.length, photoKeys: photos.map((photo) => photo.storageKey) };
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

function toPhotoId(raw: string): AppraisalPhotoId {
  const id = parseId<'AppraisalPhoto'>(raw);
  if (id.isErr()) throw new Error(`Invalid appraisal photo id ${raw}`);
  return id.value;
}

function toPhoto(row: typeof appraisalPhotos.$inferSelect): AppraisalPhoto {
  return {
    id: toPhotoId(row.id),
    appraisalId: toId(row.appraisalId),
    storageKey: row.storageKey,
    position: row.position,
    createdAt: row.createdAt,
  };
}

/** Las fotos de una tasación. El dominio limita cuántas hay; la lista igual lleva tope. */
export class DrizzleAppraisalPhotoRepository implements AppraisalPhotoRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly maxPerAppraisal: number,
  ) {}

  async listByAppraisal(appraisalId: AppraisalId): Promise<readonly AppraisalPhoto[]> {
    const rows = await this.db
      .select()
      .from(appraisalPhotos)
      .where(eq(appraisalPhotos.appraisalId, appraisalId))
      .orderBy(asc(appraisalPhotos.position), asc(appraisalPhotos.id))
      .limit(this.maxPerAppraisal);
    return rows.map(toPhoto);
  }

  async findById(id: AppraisalPhotoId): Promise<AppraisalPhoto | undefined> {
    const [row] = await this.db
      .select()
      .from(appraisalPhotos)
      .where(eq(appraisalPhotos.id, id))
      .limit(1);
    return row && toPhoto(row);
  }

  async count(appraisalId: AppraisalId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(appraisalPhotos)
      .where(eq(appraisalPhotos.appraisalId, appraisalId));
    return row?.total ?? 0;
  }

  async nextPosition(appraisalId: AppraisalId): Promise<number> {
    const [row] = await this.db
      .select({ last: max(appraisalPhotos.position) })
      .from(appraisalPhotos)
      .where(eq(appraisalPhotos.appraisalId, appraisalId));
    return (row?.last ?? -1) + 1;
  }

  async insert(photo: AppraisalPhoto, actorId: string): Promise<void> {
    await this.db.insert(appraisalPhotos).values({
      id: photo.id,
      appraisalId: photo.appraisalId,
      storageKey: photo.storageKey,
      position: photo.position,
      createdAt: photo.createdAt,
      updatedAt: photo.createdAt,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async delete(id: AppraisalPhotoId): Promise<void> {
    await this.db.delete(appraisalPhotos).where(eq(appraisalPhotos.id, id));
  }
}
