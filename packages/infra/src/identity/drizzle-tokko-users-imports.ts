import {
  TOKKO_USERS_IMPORT_FAILURES,
  TOKKO_USERS_IMPORT_STATUSES,
  TokkoUsersImport,
  type TokkoUsersImportId,
  type TokkoUsersImportRepository,
  type TokkoUsersImportSnapshot,
} from '@norde/core/identity';
import { parseId } from '@norde/core/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { toJsonb } from '../db/json';
import { importJobs } from '../db/schema';

/** Las copias de usuarios de Tokko son las corridas de este tipo. */
export const TOKKO_USERS_IMPORT_KIND = 'tokko_users';

const count0 = z.int().min(0).default(0);
const SummarySchema = z.object({
  created: count0,
  suspended: count0,
  existing: count0,
  skipped: count0,
  unassigned: count0,
});

type ImportJobRow = typeof importJobs.$inferSelect;

function toSnapshot(row: ImportJobRow): TokkoUsersImportSnapshot {
  const id = parseId<'TokkoUsersImport'>(row.id);
  if (id.isErr()) throw new Error(`Invalid import id ${row.id}`);
  return {
    id: id.value,
    status: z.enum(TOKKO_USERS_IMPORT_STATUSES).parse(row.status),
    summary: SummarySchema.parse(row.totals),
    failure:
      row.failure === null ? undefined : z.enum(TOKKO_USERS_IMPORT_FAILURES).parse(row.failure),
    requestedBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
  };
}

export class DrizzleTokkoUsersImportRepository implements TokkoUsersImportRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: TokkoUsersImportId): Promise<TokkoUsersImport | undefined> {
    const [row] = await this.db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, id), eq(importJobs.kind, TOKKO_USERS_IMPORT_KIND)))
      .limit(1);
    return row && TokkoUsersImport.restore(toSnapshot(row));
  }

  async save(job: TokkoUsersImport, actorId: string): Promise<void> {
    const s = job.toSnapshot();
    const values = {
      status: s.status,
      totals: toJsonb(s.summary),
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
        kind: TOKKO_USERS_IMPORT_KIND,
        dryRun: false,
        createdAt: s.createdAt,
        createdBy: s.requestedBy,
        ...values,
      })
      .onConflictDoUpdate({ target: importJobs.id, set: values });
  }
}
