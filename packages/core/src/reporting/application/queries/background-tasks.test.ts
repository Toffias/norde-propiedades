import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import type { BackgroundTaskRecord } from '../ports/background-task-query';
import { InMemoryBackgroundTaskQuery, InMemoryReportingUserNames } from '../../testing';

import { CountBackgroundTasks } from './count-background-tasks';
import { ListBackgroundTasks } from './list-background-tasks';

const CAMILA = '00000000-0000-7000-8000-0000000000a1';
const NICOLAS = '00000000-0000-7000-8000-0000000000a2';
const NOW = new Date('2026-10-21T12:00:00Z');

const AGENT = Actor.user(CAMILA, ['properties:read']);
const ADMIN = Actor.user(NICOLAS, ['background-tasks:read-others']);
const JOB = Actor.system('import', ['background-tasks:read-others']);

function task(
  n: number,
  overrides: Partial<BackgroundTaskRecord> & Pick<BackgroundTaskRecord, 'status'>,
): BackgroundTaskRecord {
  return {
    id: `client_import:${n.toString()}`,
    kind: 'client_import',
    sourceId: `00000000-0000-7000-8000-00000000000${n.toString()}`,
    subject: undefined,
    detail: 'contactos.xlsx',
    progress: { done: 10, total: 100 },
    problems: 0,
    failure: undefined,
    requesterId: CAMILA,
    createdAt: new Date(`2026-10-21T0${n.toString()}:00:00Z`),
    finishedAt: undefined,
    ...overrides,
  };
}

const RUNNING = task(1, { status: 'running' });
const DONE_TODAY = task(2, { status: 'done', finishedAt: new Date('2026-10-21T10:00:00Z') });
const DONE_LAST_MONTH = task(3, { status: 'done', finishedAt: new Date('2026-09-20T10:00:00Z') });
const SYSTEM_PHOTOS = task(4, {
  kind: 'media_variants',
  status: 'running',
  requesterId: 'system:import',
});
const OTHERS_FAILED = task(5, {
  status: 'failed',
  failure: 'file_missing',
  requesterId: NICOLAS,
  finishedAt: new Date('2026-10-21T11:00:00Z'),
});
const PORTAL = task(6, {
  kind: 'portal_listing',
  status: 'pending',
  requesterId: 'system:portal-sync',
});

function setup() {
  const tasks = new InMemoryBackgroundTaskQuery([
    RUNNING,
    DONE_TODAY,
    DONE_LAST_MONTH,
    SYSTEM_PHOTOS,
    OTHERS_FAILED,
    PORTAL,
  ]);
  const users = new InMemoryReportingUserNames({ [CAMILA]: 'Camila Pérez', [NICOLAS]: 'Nicolás' });
  const clock = new FixedClock(NOW);
  return {
    tasks,
    users,
    list: new ListBackgroundTasks({ tasks, users, clock }),
    count: new CountBackgroundTasks({ tasks, clock }),
  };
}

describe('ListBackgroundTasks', () => {
  it('lists what the user asked for, running first, with the finished of the last week', async () => {
    const { list, tasks } = setup();

    const page = unwrap(await list.execute({}, AGENT));

    expect(page.items.map((row) => row.id)).toEqual([RUNNING.id, DONE_TODAY.id]);
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 10, active: 1 });
    expect(page.items[0]?.requester).toEqual({ id: CAMILA, name: 'Camila Pérez' });
    expect(tasks.criteria[0]).toEqual({
      requesterId: CAMILA,
      includePortals: false,
      finishedSince: new Date('2026-10-14T12:00:00Z'),
    });
  });

  it('hides the finished before they were cleared, but never the running ones', async () => {
    const { list } = setup();

    const page = unwrap(await list.execute({ clearedAt: '2026-10-21T11:30:00Z' }, AGENT));

    expect(page.items.map((row) => row.id)).toEqual([RUNNING.id]);
  });

  it('shows everyone, the system and the portals to who can see the others', async () => {
    const { list } = setup();

    const page = unwrap(await list.execute({ scope: 'all', pageSize: 3 }, ADMIN));

    expect(page.total).toBe(5);
    expect(page.active).toBe(3);
    expect(page.items.map((row) => row.kind)).toEqual([
      'portal_listing',
      'media_variants',
      'client_import',
    ]);
    // Lo que corrió el sistema no tiene una persona que lo pidió.
    expect(page.items[1]?.requester).toBeUndefined();
    const next = unwrap(await list.execute({ scope: 'all', page: 2, pageSize: 3 }, ADMIN));
    expect(next.items.map((row) => row.id)).toEqual([OTHERS_FAILED.id, DONE_TODAY.id]);
    expect(next.items[0]?.requester).toEqual({ id: NICOLAS, name: 'Nicolás' });
  });

  it('asks for the names only of people, once per page', async () => {
    const { list, users } = setup();

    unwrap(await list.execute({ scope: 'all' }, ADMIN));

    expect(users.requested).toEqual([[CAMILA, NICOLAS]]);
  });

  it('needs the permission to see the others, and a person asking', async () => {
    const { list } = setup();

    expect(unwrapErr(await list.execute({ scope: 'all' }, AGENT))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await list.execute({}, JOB))).toEqual({ type: 'Forbidden' });
  });

  it('rejects an invalid page or cleared date', async () => {
    const { list } = setup();

    expect(unwrapErr(await list.execute({ pageSize: 500 }, AGENT)).type).toBe('InvalidInput');
    expect(unwrapErr(await list.execute({ clearedAt: 'ayer' }, AGENT)).type).toBe('InvalidInput');
  });
});

describe('CountBackgroundTasks', () => {
  it('counts the running tasks in reach', async () => {
    const { count } = setup();

    expect(unwrap(await count.execute({}, AGENT))).toEqual({ active: 1 });
    expect(unwrap(await count.execute({ scope: 'all' }, ADMIN))).toEqual({ active: 3 });
    expect(unwrapErr(await count.execute({ scope: 'all' }, AGENT))).toEqual({ type: 'Forbidden' });
  });
});
