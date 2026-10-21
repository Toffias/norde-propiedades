import {
  PROPERTY_IMPORT_FAILURES,
  PROPERTY_IMPORT_FIELDS,
  PROPERTY_IMPORT_PROBLEM_CODES,
  PROPERTY_IMPORT_SOURCES,
  PROPERTY_IMPORT_STATUSES,
  PropertyImport,
  type PropertyImportId,
  type PropertyImportItem,
  type PropertyImportQuery,
  type PropertyImportRepository,
  type PropertyImportRowProblem,
  type PropertyImportSnapshot,
} from '@norde/core/properties';
import { parseId, type IdGenerator, type PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { toJsonb } from '../db/json';
import { importJobErrors, importJobs } from '../db/schema';

/** Las importaciones de propiedades de Tokko (de la exportación o de la API) son las de este tipo. */
const KIND = 'properties_tokko';

/** Las anteriores a la API no guardaban el origen: son de la exportación. */
const OptionsSchema = z.object({
  columns: z.partialRecord(z.enum(PROPERTY_IMPORT_FIELDS), z.int().min(0)),
  source: z.enum(PROPERTY_IMPORT_SOURCES).default('file'),
  /** Las de antes de traer emprendimientos no los tienen pendientes. */
  developmentsDone: z.boolean().default(true),
});

const count0 = z.int().min(0).default(0);
const TotalsSchema = z.object({
  rows: count0,
  processed: count0,
  created: count0,
  existing: count0,
  completed: count0,
  failed: count0,
  developments: z
    .object({ created: count0, existing: count0, completed: count0, failed: count0 })
    .default({ created: 0, existing: 0, completed: 0, failed: 0 }),
});

const ProblemRawSchema = z.object({
  field: z.enum(PROPERTY_IMPORT_FIELDS).optional(),
  propertyId: z.string().optional(),
  reference: z.string().optional(),
  subject: z.enum(['property', 'development']).optional(),
});

type ImportJobRow = typeof importJobs.$inferSelect;

function toSnapshot(row: ImportJobRow): PropertyImportSnapshot {
  const id = parseId<'PropertyImport'>(row.id);
  if (id.isErr()) throw new Error(`Invalid import id ${row.id}`);
  const options = OptionsSchema.parse(row.options);
  return {
    id: id.value,
    source: options.source,
    fileName: row.fileName ?? '',
    storageKey: row.storageKey ?? '',
    status: z.enum(PROPERTY_IMPORT_STATUSES).parse(row.status),
    columns: options.columns,
    developmentsDone: options.developmentsDone,
    totals: TotalsSchema.parse(row.totals),
    failure: row.failure === null ? undefined : z.enum(PROPERTY_IMPORT_FAILURES).parse(row.failure),
    requestedBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

function toItem(row: ImportJobRow): PropertyImportItem {
  const { storageKey: _key, columns: _columns, updatedAt: _updatedAt, ...item } = toSnapshot(row);
  return item;
}

export class DrizzlePropertyImportRepository implements PropertyImportRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: PropertyImportId): Promise<PropertyImport | undefined> {
    const [row] = await this.db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.kind, KIND)))
      .limit(1);
    return row && PropertyImport.restore(toSnapshot(row));
  }

  async save(job: PropertyImport, actorId: string): Promise<void> {
    const s = job.toSnapshot();
    const values = {
      status: s.status,
      fileName: s.fileName,
      storageKey: s.storageKey,
      options: toJsonb({
        columns: s.columns,
        source: s.source,
        developmentsDone: s.developmentsDone,
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

  async hasActiveApiImport(): Promise<boolean> {
    const [row] = await this.db
      .select({ id: importJobs.id })
      .from(importJobs)
      .where(
        and(
          eq(importJobs.kind, KIND),
          inArray(importJobs.status, ['pending', 'running']),
          sql`${importJobs.options}->>'source' = 'api'`,
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async addProblem(
    importId: PropertyImportId,
    problem: PropertyImportRowProblem,
    now: Date,
  ): Promise<void> {
    await this.db.insert(importJobErrors).values({
      id: this.ids.next(),
      jobId: importId,
      rowNumber: problem.rowNumber,
      entityType: 'property',
      message: problem.code,
      raw: toJsonb({
        field: problem.field,
        propertyId: problem.propertyId,
        reference: problem.reference,
        subject: problem.subject,
      }),
      createdAt: now,
    });
  }
}

export class DrizzlePropertyImportQuery implements PropertyImportQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(query: {
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<PropertyImportItem>> {
    const order = query.direction === 'asc' ? asc : desc;
    const where = eq(importJobs.kind, KIND);
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

  async find(importId: string): Promise<PropertyImportItem | undefined> {
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
  }): Promise<PageSlice<PropertyImportRowProblem>> {
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
          code: z.enum(PROPERTY_IMPORT_PROBLEM_CODES).parse(row.message),
          field: raw.field,
          propertyId: raw.propertyId,
          reference: raw.reference,
          subject: raw.subject,
        };
      }),
      total: total?.value ?? 0,
    };
  }
}
