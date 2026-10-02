import {
  ClientImport,
  CLIENT_IMPORT_FAILURES,
  CLIENT_IMPORT_STATUSES,
  IMPORT_FIELDS,
  IMPORT_PROBLEM_CODES,
  type ClientImportId,
  type ClientImportItem,
  type ClientImportQuery,
  type ClientImportRepository,
  type ClientImportSnapshot,
  type ImportRowProblem,
} from '@norde/core/clients';
import { parseId, type IdGenerator, type PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { toJsonb } from '../db/json';
import { importJobErrors, importJobs } from '../db/schema';

/** Las importaciones de contactos son las corridas de este tipo. */
const KIND = 'clients_xlsx';

const OptionsSchema = z.object({
  mapping: z.partialRecord(z.enum(IMPORT_FIELDS), z.int().min(0)),
  agentId: z.string().optional(),
  branchId: z.string().optional(),
});

const count0 = z.int().min(0).default(0);
const TotalsSchema = z.object({
  rows: count0,
  processed: count0,
  created: count0,
  duplicates: count0,
  failed: count0,
});

const ProblemRawSchema = z.object({
  field: z.enum(IMPORT_FIELDS).optional(),
  clientId: z.string().optional(),
});

type ImportJobRow = typeof importJobs.$inferSelect;

function toSnapshot(row: ImportJobRow): ClientImportSnapshot {
  const id = parseId<'ClientImport'>(row.id);
  if (id.isErr()) throw new Error(`Invalid import id ${row.id}`);
  const options = OptionsSchema.parse(row.options);
  return {
    id: id.value,
    fileName: row.fileName ?? '',
    storageKey: row.storageKey ?? '',
    status: z.enum(CLIENT_IMPORT_STATUSES).parse(row.status),
    mapping: options.mapping,
    agentId: options.agentId,
    branchId: options.branchId,
    totals: TotalsSchema.parse(row.totals),
    failure: row.failure === null ? undefined : z.enum(CLIENT_IMPORT_FAILURES).parse(row.failure),
    requestedBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

function toItem(row: ImportJobRow): ClientImportItem {
  const { storageKey: _key, mapping: _mapping, updatedAt: _updatedAt, ...item } = toSnapshot(row);
  return item;
}

export class DrizzleClientImportRepository implements ClientImportRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
  ) {}

  async findById(id: ClientImportId): Promise<ClientImport | undefined> {
    const [row] = await this.db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.kind, KIND)))
      .limit(1);
    return row && ClientImport.restore(toSnapshot(row));
  }

  async save(job: ClientImport, actorId: string): Promise<void> {
    const s = job.toSnapshot();
    const values = {
      status: s.status,
      fileName: s.fileName,
      storageKey: s.storageKey,
      options: toJsonb({ mapping: s.mapping, agentId: s.agentId, branchId: s.branchId }),
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

  async addProblem(importId: ClientImportId, problem: ImportRowProblem, now: Date): Promise<void> {
    await this.db.insert(importJobErrors).values({
      id: this.ids.next(),
      jobId: importId,
      rowNumber: problem.rowNumber,
      entityType: 'client',
      message: problem.code,
      raw: toJsonb({ field: problem.field, clientId: problem.clientId }),
      createdAt: now,
    });
  }
}

export class DrizzleClientImportQuery implements ClientImportQuery {
  constructor(private readonly db: DbExecutor) {}

  async list(query: {
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ClientImportItem>> {
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

  async find(importId: string): Promise<ClientImportItem | undefined> {
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
  }): Promise<PageSlice<ImportRowProblem>> {
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
          code: z.enum(IMPORT_PROBLEM_CODES).parse(row.message),
          field: raw.field,
          clientId: raw.clientId,
        };
      }),
      total: total?.value ?? 0,
    };
  }
}
