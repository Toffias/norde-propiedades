import { TokkoUsersImport, type TokkoUsersImportId } from '@norde/core/identity';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { importJobs } from '../db/schema';

import { DrizzleTokkoUsersImportRepository } from './drizzle-tokko-users-imports';

const db = useTestDatabase();
const repository = new DrizzleTokkoUsersImportRepository(db);
const ID = '00000000-0000-7000-8000-0000000000e1' as TokkoUsersImportId;
const ADMIN = '00000000-0000-7000-8000-0000000000a1';
const ASKED = new Date('2026-10-21T12:00:00Z');
const FINISHED = new Date('2026-10-21T12:05:00Z');

describe('DrizzleTokkoUsersImportRepository', () => {
  it('saves the run as an import job and restores it after it finishes', async () => {
    const job = TokkoUsersImport.request({ id: ID, requestedBy: ADMIN, now: ASKED });
    await repository.save(job, ADMIN);
    job.start(ASKED);
    job.finish({ created: 3, suspended: 1, existing: 0, skipped: 2, unassigned: 1 }, FINISHED);
    await repository.save(job, 'system:import');

    expect((await repository.findById(ID))?.toSnapshot()).toEqual(job.toSnapshot());
    const [row] = await db.select().from(importJobs);
    // Quien la pidió queda como autor; el job, como el último que la cambió.
    expect(row).toMatchObject({
      kind: 'tokko_users',
      createdBy: ADMIN,
      updatedBy: 'system:import',
    });
  });

  it('does not find an import of another kind', async () => {
    await db.insert(importJobs).values({
      id: ID,
      kind: 'clients_xlsx',
      createdAt: ASKED,
      updatedAt: ASKED,
      createdBy: ADMIN,
      updatedBy: ADMIN,
    });

    expect(await repository.findById(ID)).toBeUndefined();
  });
});
