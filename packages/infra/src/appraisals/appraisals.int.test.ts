import {
  ChangeAppraisalStatus,
  CreateAppraisal,
  DeleteAppraisal,
  EraseClientAppraisals,
  GetAppraisal,
  ListAppraisals,
  MoveMergedClientAppraisals,
  UpdateAppraisal,
  type ActiveUsers,
  type PanelDirectory,
} from '@norde/core/appraisals';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { appraisals, auditLog, clients, outbox } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createAppraisalsUnitOfWork } from './appraisals-unit-of-work';
import { DrizzleAppraisalQuery } from './drizzle-appraisal-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-04T15:00:00Z');
const uow = createAppraisalsUnitOfWork(db, { ids, clock });
const query = new DrizzleAppraisalQuery(db);

const PRODUCER = '00000000-0000-7000-8000-0000000000a1';
const APPRAISER = '00000000-0000-7000-8000-0000000000a2';
const OTHER_AGENT = '00000000-0000-7000-8000-0000000000a3';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const CLIENT = '00000000-0000-7000-8000-0000000000d1';
const OTHER_CLIENT = '00000000-0000-7000-8000-0000000000d2';
const NOW = new Date('2026-10-01T12:00:00Z');

const users: ActiveUsers = {
  find: (userId) =>
    Promise.resolve(userId === APPRAISER ? { branchId: OTHER_BRANCH } : { branchId: BRANCH }),
};
const directory: PanelDirectory = { names: () => Promise.resolve(new Map()) };

const create = new CreateAppraisal({ uow, users, clock, ids });
const list = new ListAppraisals({ appraisals: query, directory });

const PRODUCER_ACTOR = Actor.user(PRODUCER, [
  'appraisals:read',
  'appraisals:create',
  'appraisals:update',
  'appraisals:delete',
]).withBranch(BRANCH);
const MANAGER = Actor.user(OTHER_AGENT, ['appraisals:*']);
const SCHEDULER = Actor.system('scheduler', [
  'appraisals:erase-client-data',
  'appraisals:merge-client-data',
]);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aClient(id: string, name: string): Promise<void> {
  await db.insert(clients).values({
    id,
    name,
    kind: 'person',
    clientTypes: [],
    agentId: PRODUCER,
    branchId: BRANCH,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: PRODUCER,
    updatedBy: PRODUCER,
  });
}

async function anAppraisal(
  input: Partial<Parameters<CreateAppraisal['execute']>[0]> = {},
  actor: Actor = PRODUCER_ACTOR,
): Promise<{ readonly appraisalId: string; readonly code: string }> {
  return unwrap(
    await create.execute({ requesterClientId: CLIENT, propertyType: 'house', ...input }, actor),
  );
}

describe('appraisals (Postgres)', () => {
  it('creates an appraisal with a sequential code, its outbox event and audit entry', async () => {
    await aClient(CLIENT, 'Ana Pérez');
    const first = await anAppraisal({
      address: 'Mitre 1234',
      surfaceTotalM2: 120.25,
      rooms: 4,
      condition: 'good',
      appraiserUserId: APPRAISER,
      visitAt: '2026-10-10T10:30',
    });
    const second = await anAppraisal();

    expect(first.code).toMatch(/^TAS\d{4,}$/);
    expect(Number(second.code.slice(3))).toBe(Number(first.code.slice(3)) + 1);

    const [row] = await db.select().from(appraisals).where(eq(appraisals.id, first.appraisalId));
    expect(row).toMatchObject({
      status: 'requested',
      source: 'manual',
      requesterClientId: CLIENT,
      producerUserId: PRODUCER,
      branchId: BRANCH,
      appraiserUserId: APPRAISER,
      surfaceTotalM2: 120.25,
      visitAt: new Date('2026-10-10T13:30:00.000Z'),
      createdBy: PRODUCER,
    });
    const events = await db.select().from(outbox).where(eq(outbox.aggregateId, first.appraisalId));
    expect(events.map((e) => e.eventType)).toEqual(['appraisals.appraisal_requested']);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, first.appraisalId));
    expect(entry).toMatchObject({
      action: 'appraisal.created',
      entityType: 'appraisal',
      clientIds: [CLIENT],
    });

    const detail = unwrap(
      await new GetAppraisal({ appraisals: query, directory }).execute(
        { appraisalId: first.appraisalId },
        PRODUCER_ACTOR,
      ),
    );
    expect(detail).toMatchObject({
      code: first.code,
      requester: { id: CLIENT, name: 'Ana Pérez' },
      rooms: 4,
      condition: 'good',
    });
  });

  it('updates, changes the status and moves it to the trash', async () => {
    const { appraisalId } = await anAppraisal({ visitAt: '2026-10-10T10:30' });
    const update = new UpdateAppraisal({ uow, users, clock });
    const change = new ChangeAppraisalStatus({ uow, clock });
    const remove = new DeleteAppraisal({ uow, clock });

    unwrap(
      await update.execute(
        { appraisalId, requesterClientId: CLIENT, propertyType: 'ph', visitAt: '2026-10-10T10:30' },
        PRODUCER_ACTOR,
      ),
    );
    unwrap(await change.execute({ appraisalId, status: 'visit_scheduled' }, PRODUCER_ACTOR));
    unwrap(await remove.execute({ appraisalId }, PRODUCER_ACTOR));

    const [row] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
    expect(row).toMatchObject({
      propertyType: 'ph',
      status: 'visit_scheduled',
      deletedBy: PRODUCER,
      updatedBy: PRODUCER,
    });
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, appraisalId));
    expect(entries.map((e) => e.action).sort()).toEqual([
      'appraisal.created',
      'appraisal.deleted',
      'appraisal.status_changed',
      'appraisal.updated',
    ]);
  });

  it('filters, sorts and paginates in the database without losing rows', async () => {
    const created: string[] = [];
    for (let day = 1; day <= 7; day += 1) {
      clock.advance(60_000);
      const { appraisalId } = await anAppraisal({
        propertyType: day % 2 === 0 ? 'apartment' : 'house',
        visitAt: `2026-10-${String(day + 10).padStart(2, '0')}T10:00`,
        ...(day === 7 ? { appraiserUserId: APPRAISER } : {}),
      });
      created.push(appraisalId);
    }
    const other = await anAppraisal({}, Actor.user(OTHER_AGENT, ['appraisals:create']));

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = unwrap(
        await list.execute({ page, pageSize: 3, sort: 'visitAt' }, PRODUCER_ACTOR),
      );
      expect(result.total).toBe(7);
      seen.push(...result.items.map((item) => item.id));
    }
    expect(seen).toEqual(created);

    const houses = unwrap(
      await list.execute({ propertyType: 'house', visitFrom: '2026-10-12' }, PRODUCER_ACTOR),
    );
    expect(houses.items.map((item) => item.id).sort()).toEqual(
      [created[2], created[4], created[6]].sort(),
    );

    const byAppraiser = unwrap(await list.execute({ appraiserId: APPRAISER }, PRODUCER_ACTOR));
    expect(byAppraiser.items.map((item) => item.id)).toEqual([created[6]]);

    const all = unwrap(await list.execute({ pageSize: 100 }, MANAGER));
    expect(all.items.map((item) => item.id)).toContain(other.appraisalId);

    const appraiser = Actor.user(APPRAISER, ['appraisals:read']);
    const assigned = unwrap(await list.execute({}, appraiser));
    expect(assigned.items.map((item) => item.id)).toEqual([created[6]]);
  });

  it('filters by status group and trash', async () => {
    const pending = await anAppraisal();
    const discarded = await anAppraisal();
    const trashed = await anAppraisal();
    unwrap(
      await new ChangeAppraisalStatus({ uow, clock }).execute(
        { appraisalId: discarded.appraisalId, status: 'discarded' },
        PRODUCER_ACTOR,
      ),
    );
    unwrap(
      await new DeleteAppraisal({ uow, clock }).execute(
        { appraisalId: trashed.appraisalId },
        PRODUCER_ACTOR,
      ),
    );

    const listIds = async (input: Parameters<ListAppraisals['execute']>[0]) =>
      unwrap(await list.execute(input, PRODUCER_ACTOR)).items.map((item) => item.id);
    expect(await listIds({ status: 'pending' })).toEqual([pending.appraisalId]);
    expect(await listIds({ status: 'discarded' })).toEqual([discarded.appraisalId]);
    expect(await listIds({ view: 'trash' })).toEqual([trashed.appraisalId]);
  });

  it('moves appraisals of a merged contact and erases those of an erased one', async () => {
    const { appraisalId } = await anAppraisal();
    await anAppraisal({ requesterClientId: OTHER_CLIENT });

    const moved = unwrap(
      await new MoveMergedClientAppraisals({ uow }).execute(
        { clientId: OTHER_CLIENT, mergedClientId: CLIENT },
        SCHEDULER,
      ),
    );
    expect(moved).toEqual({ moved: 1 });
    const [row] = await db.select().from(appraisals).where(eq(appraisals.id, appraisalId));
    expect(row?.requesterClientId).toBe(OTHER_CLIENT);

    const erased = unwrap(
      await new EraseClientAppraisals({ uow }).execute({ clientIds: [OTHER_CLIENT] }, SCHEDULER),
    );
    expect(erased).toEqual({ erased: 2 });
    expect(await db.select().from(appraisals)).toEqual([]);
  });
});
