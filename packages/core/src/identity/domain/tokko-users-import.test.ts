import { describe, expect, it } from 'vitest';

import type { Id } from '../../shared/domain/id';

import { TokkoUsersImport } from './tokko-users-import';

const ID = '00000000-0000-7000-8000-000000000001' as Id<'TokkoUsersImport'>;
const ASKED = new Date('2026-10-21T12:00:00Z');
const STARTED = new Date('2026-10-21T12:01:00Z');
const FINISHED = new Date('2026-10-21T12:05:00Z');
const SUMMARY = { created: 3, suspended: 1, existing: 2, skipped: 0, unassigned: 1 };

const requested = () => TokkoUsersImport.request({ id: ID, requestedBy: 'admin-1', now: ASKED });

describe('TokkoUsersImport', () => {
  it('is born pending and asks the job to run it', () => {
    const job = requested();

    expect(job.toSnapshot()).toMatchObject({ status: 'pending', requestedBy: 'admin-1' });
    expect(job.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'identity.tokko_users_import_requested',
        payload: { requestId: ID },
      }),
    ]);
  });

  it('runs and finishes with the summary', () => {
    const job = requested();

    job.start(STARTED);
    expect(job.toSnapshot()).toMatchObject({ status: 'running', startedAt: STARTED });
    // Si el job se corta y se retoma, sigue con el inicio original.
    job.start(FINISHED);
    expect(job.toSnapshot().startedAt).toBe(STARTED);

    job.finish(SUMMARY, FINISHED);
    expect(job.isFinished).toBe(true);
    expect(job.toSnapshot()).toMatchObject({
      status: 'done',
      summary: SUMMARY,
      finishedAt: FINISHED,
    });
  });

  it('fails with the reason', () => {
    const job = requested();

    job.fail('tokko_unavailable', FINISHED);

    expect(job.isFinished).toBe(true);
    expect(job.toSnapshot()).toMatchObject({ status: 'failed', failure: 'tokko_unavailable' });
  });
});
