import {
  DevelopmentUnitImport,
  UNIT_IMPORT_FAILURES,
  UNIT_IMPORT_FIELDS,
  UNIT_IMPORT_PROBLEM_CODES,
  UNIT_IMPORT_STATUSES,
  type DevelopmentUnitImportId,
  type DevelopmentUnitImportItem,
  type DevelopmentUnitImportQuery,
  type DevelopmentUnitImportRepository,
  type DevelopmentUnitImportSnapshot,
  type UnitImportRowProblem,
} from '@norde/core/properties';
import { parseId, type IdGenerator, type PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { toJsonb } from '../db/json';
import { importJobErrors, importJobs } from '../db/schema';

/** Las importaciones de unidades son las corridas de este tipo. */
const KIND = 'units_xlsx';

const OptionsSchema = z.object({
  developmentId: z.string(),
  mapping: z.partialRecord(z.enum(UNIT_IMPORT_FIELDS), z.int().min(0)),
  canMarkAvailable: z.boolean().default(false),
});

const count0 = z.int().min(0).default(0);
const TotalsSchema = z.object({
  rows: count0,
  processed: count0,
  created: count0,
  updated: count0,
  unchanged: count0,
  failed: count0,
});

const ProblemRawSchema = z.object({
  field: z.enum(UNIT_IMPORT_FIELDS).optional(),
  propertyId: z.string().optional(),
});

type ImportJobRow = typeof importJobs.$inferSelect;

function toSnapshot(row: ImportJobRow): DevelopmentUnitImportSnapshot {
  const id = parseId<'DevelopmentUnitImport'>(row.id);
  if (id.isErr()) throw new Error(`Invalid import id ${row.id}`);
  const options = OptionsSchema.parse(row.options);
  return {
    id: id.value,
    developmentId: options.developmentId,
    fileName: row.fileName ?? '',
    storageKey: row.storageKey ?? '',
    status: z.enum(UNIT_IMPORT_STATUSES).parse(row.status),
    mapping: options.mapping,
    canMarkAvailable: options.canMarkAvailable,
    totals: TotalsSchema.parse(row.totals),
    failure: row.failure === null ? undefined : z.enum(UNIT_IMPORT_FAILURES).parse(row.failure),
    requestedBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

function toItem(row: ImportJobRow): DevelopmentUnitImportItem {
  const {
    storageKey: _key,
    mapping: _mapping,
    canMarkAvailable: _canMarkAvailable,
    updatedAt: _updatedAt,
    ...item
  } = toSnapshot(row);
  return item;
}

/** El emprendimiento de la importación, dentro de las opciones (`import_jobs_units_development_idx`). */
const developmentOf = sql`(${importJobs.options} ->> 'developmentId')`;

export class DrizzleDevelopmentUnitImportRepository implements DevelopmentUnitImportRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: DevelopmentUnitImportId): Promise<DevelopmentUnitImport | undefined> {
    const [row] = await this.db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.kind, KIND)))
      .limit(1);
    return row && DevelopmentUnitImport.restore(toSnapshot(row));
  }

  async save(job: DevelopmentUnitImport, actorId: string): Promise<void> {
    const s = job.toSnapshot();
    const values = {
      status: s.status,
      fileName: s.fileName,
      storageKey: s.storageKey,
      options: toJsonb({
        developmentId: s.developmentId,
        mapping: s.mapping,
        canMarkAvailable: s.canMarkAvailable,
      }),
      totals: toJsonb(s.totals),
      failure: s.failure ?? null,
      startedAt: s.startedAt ?? null,
      finishedAt: s.finishedAt ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(importJobs)
      .values({
        id: s.id,
        kind: KIND,
        dryRun: false,
        createdAt: s.createdAt,
        createdBy: s.requestedBy,
        ...values,
      })
      .onConflictDoUpdate({ target: importJobs.id, set: values });
  }

  async addProblem(
    importId: DevelopmentUnitImportId,
    problem: UnitImportRowProblem,
    now: Date,
  ): Promise<void> {
    await this.db.insert(importJobErrors).values({
      id: this.ids.next(),
      jobId: importId,
      rowNumber: problem.rowNumber,
      entityType: 'property',
      message: problem.code,
      raw: toJsonb({ field: problem.field, propertyId: problem.propertyId }),
      createdAt: now,
    });
  }
}

export class DrizzleDevelopmentUnitImportQuery implements DevelopmentUnitImportQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(query: {
    readonly developmentId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<DevelopmentUnitImportItem>> {
    const order = query.direction === 'asc' ? asc : desc;
    const where = and(eq(importJobs.kind, KIND), sql`${developmentOf} = ${query.developmentId}`);
    const [rows, [total]] = await Promise.all([
      this.db
        .select()
        .from(importJobs)
        .where(where)
        .orderBy(order(importJobs.createdAt), order(importJobs.id))
        .offset(query.offset)
        .limit(query.limit),
      this.db.select({ value: count() }).from(importJobs).where(where),
    ]);
    return { items: rows.map(toItem), total: total?.value ?? 0 };
  }

  async find(importId: string): Promise<DevelopmentUnitImportItem | undefined> {
    const [row] = await this.db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, importId), eq(importJobs.kind, KIND)))
      .limit(1);
    return row && toItem(row);
  }

  async problems(query: {
    readonly importId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<UnitImportRowProblem>> {
    const order = query.direction === 'asc' ? asc : desc;
    const where = eq(importJobErrors.jobId, query.importId);
    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          rowNumber: importJobErrors.rowNumber,
          message: importJobErrors.message,
          raw: importJobErrors.raw,
        })
        .from(importJobErrors)
        .where(where)
        .orderBy(order(importJobErrors.rowNumber), order(importJobErrors.id))
        .offset(query.offset)
        .limit(query.limit),
      this.db.select({ value: count() }).from(importJobErrors).where(where),
    ]);
    return {
      items: rows.map((row) => {
        const raw = ProblemRawSchema.parse(row.raw ?? {});
        return {
          rowNumber: row.rowNumber ?? 0,
          code: z.enum(UNIT_IMPORT_PROBLEM_CODES).parse(row.message),
          field: raw.field,
          propertyId: raw.propertyId,
        };
      }),
      total: total?.value ?? 0,
    };
  }
}
