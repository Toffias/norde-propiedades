import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  APPRAISAL_ID,
  APPRAISER_ID,
  appraisalSnapshot,
  BRANCH_ID,
  InMemoryActiveUsers,
  InMemoryAppraisalsUnitOfWork,
  OTHER_BRANCH_ID,
  OTHER_CLIENT_ID,
  OTHER_USER_ID,
  PRODUCER_ID,
  REQUESTER_ID,
  TEST_APPRAISER,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import { ChangeAppraisalStatus } from './change-appraisal-status';
import { CreateAppraisal } from './create-appraisal';
import { DeleteAppraisal } from './delete-appraisal';
import { RestoreAppraisal } from './restore-appraisal';
import { UpdateAppraisal } from './update-appraisal';

const FIRST_ID = '00000000-0000-7000-8000-000000000001';
const INACTIVE_USER = '00000000-0000-7000-8000-0000000000a8';

function setup() {
  const uow = new InMemoryAppraisalsUnitOfWork();
  const users = new InMemoryActiveUsers(
    new Map([
      [PRODUCER_ID, { branchId: BRANCH_ID }],
      [APPRAISER_ID, { branchId: OTHER_BRANCH_ID }],
      [OTHER_USER_ID, { branchId: OTHER_BRANCH_ID }],
    ]),
  );
  const clock = new FixedClock(TEST_NOW);
  return { uow, users, clock };
}

/** Con una tasación cargada. */
function withAppraisal(overrides: Parameters<typeof appraisalSnapshot>[0] = {}) {
  const context = setup();
  const snapshot = appraisalSnapshot(overrides);
  context.uow.appraisals.rows.set(snapshot.id, snapshot);
  const stored = () => context.uow.appraisals.rows.get(APPRAISAL_ID);
  return { ...context, stored };
}

const INPUT = {
  requesterClientId: REQUESTER_ID,
  propertyType: 'apartment' as const,
  address: 'Belgrano 450, 3° B',
  surfaceTotalM2: '72.5',
  rooms: '3',
  condition: 'very_good' as const,
};

describe('CreateAppraisal', () => {
  it('creates a requested appraisal with the next code and records it', async () => {
    const { uow, users, clock } = setup();
    const create = new CreateAppraisal({ uow, users, clock, ids: new SequentialIdGenerator() });

    const created = unwrap(
      await create.execute(
        { ...INPUT, appraiserUserId: APPRAISER_ID, visitAt: '2026-10-10T10:30' },
        TEST_PRODUCER,
      ),
    );

    expect(created).toEqual({ appraisalId: FIRST_ID, code: 'TAS0001' });
    expect(uow.appraisals.rows.get(FIRST_ID)).toMatchObject({
      status: 'requested',
      source: 'manual',
      requesterClientId: REQUESTER_ID,
      producerUserId: PRODUCER_ID,
      branchId: BRANCH_ID,
      appraiserUserId: APPRAISER_ID,
      visitAt: new Date('2026-10-10T13:30:00.000Z'),
      surfaceTotalM2: 72.5,
      rooms: 3,
    });
    expect(uow.appraisals.savedBy.get(FIRST_ID)).toBe(PRODUCER_ID);
    expect(uow.events.published.map((e) => e.type)).toEqual(['appraisals.appraisal_requested']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'appraisal.created',
        entityType: 'appraisal',
        entityId: FIRST_ID,
        clientIds: [REQUESTER_ID],
        actorId: PRODUCER_ID,
        changes: {
          code: { before: null, after: 'TAS0001' },
          source: { before: null, after: 'manual' },
          status: { before: null, after: 'requested' },
          requesterClientId: { before: null, after: REQUESTER_ID },
          producerUserId: { before: null, after: PRODUCER_ID },
          branchId: { before: null, after: BRANCH_ID },
          appraiserUserId: { before: null, after: APPRAISER_ID },
          visitAt: { before: null, after: new Date('2026-10-10T13:30:00.000Z') },
          propertyType: { before: null, after: 'apartment' },
          address: { before: null, after: 'Belgrano 450, 3° B' },
          surfaceTotalM2: { before: null, after: 72.5 },
          rooms: { before: null, after: 3 },
          condition: { before: null, after: 'very_good' },
        },
      }),
    ]);
  });

  it('numbers each appraisal with the sequence', async () => {
    const { uow, users, clock } = setup();
    const create = new CreateAppraisal({ uow, users, clock, ids: new SequentialIdGenerator() });
    await create.execute(INPUT, TEST_PRODUCER);
    const second = unwrap(await create.execute(INPUT, TEST_PRODUCER));
    expect(second.code).toBe('TAS0002');
  });

  it('takes the branch of the chosen producer', async () => {
    const { uow, users, clock } = setup();
    const create = new CreateAppraisal({ uow, users, clock, ids: new SequentialIdGenerator() });
    unwrap(await create.execute({ ...INPUT, producerUserId: OTHER_USER_ID }, TEST_PRODUCER));
    expect(uow.appraisals.rows.get(FIRST_ID)).toMatchObject({
      producerUserId: OTHER_USER_ID,
      branchId: OTHER_BRANCH_ID,
    });
  });

  it('rejects an inactive producer or appraiser', async () => {
    const { uow, users, clock } = setup();
    const create = new CreateAppraisal({ uow, users, clock, ids: new SequentialIdGenerator() });
    expect(
      unwrapErr(await create.execute({ ...INPUT, producerUserId: INACTIVE_USER }, TEST_PRODUCER)),
    ).toEqual({ type: 'ProducerNotFound' });
    expect(
      unwrapErr(await create.execute({ ...INPUT, appraiserUserId: INACTIVE_USER }, TEST_PRODUCER)),
    ).toEqual({ type: 'AppraiserNotFound' });
    expect(uow.appraisals.rows.size).toBe(0);
  });

  it('rejects an invalid input', async () => {
    const { uow, users, clock } = setup();
    const create = new CreateAppraisal({ uow, users, clock, ids: new SequentialIdGenerator() });
    const error = unwrapErr(
      await create.execute({ ...INPUT, requesterClientId: 'nope' }, TEST_PRODUCER),
    );
    expect(error.type).toBe('InvalidInput');
  });

  it('needs appraisals:create', async () => {
    const { uow, users, clock } = setup();
    const create = new CreateAppraisal({ uow, users, clock, ids: new SequentialIdGenerator() });
    expect(unwrapErr(await create.execute(INPUT, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await create.execute(INPUT, TEST_APPRAISER))).toEqual({ type: 'Forbidden' });
  });
});

describe('UpdateAppraisal', () => {
  const EDIT = {
    appraisalId: APPRAISAL_ID,
    requesterClientId: REQUESTER_ID,
    propertyType: 'house' as const,
    address: 'Mitre 1234',
    surfaceTotalM2: 300,
    surfaceCoveredM2: 180.5,
    rooms: 5,
    bedrooms: 3,
    bathrooms: 2,
    condition: 'good' as const,
  };

  it('records only the fields that changed', async () => {
    const { uow, users, clock, stored } = withAppraisal();
    const update = new UpdateAppraisal({ uow, users, clock });

    unwrap(
      await update.execute(
        { ...EDIT, rooms: 6, appraiserUserId: APPRAISER_ID, requesterClientId: OTHER_CLIENT_ID },
        TEST_PRODUCER,
      ),
    );

    expect(stored()).toMatchObject({
      rooms: 6,
      appraiserUserId: APPRAISER_ID,
      requesterClientId: OTHER_CLIENT_ID,
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['appraisals.appraisal_updated']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'appraisal.updated',
        entityId: APPRAISAL_ID,
        clientIds: [OTHER_CLIENT_ID, REQUESTER_ID],
        changes: {
          rooms: { before: 5, after: 6 },
          appraiserUserId: { before: null, after: APPRAISER_ID },
          requesterClientId: { before: REQUESTER_ID, after: OTHER_CLIENT_ID },
        },
      }),
    ]);
  });

  it('records nothing when nothing changed', async () => {
    const { uow, users, clock } = withAppraisal();
    const update = new UpdateAppraisal({ uow, users, clock });
    unwrap(await update.execute(EDIT, TEST_PRODUCER));
    expect(uow.audit.entries).toEqual([]);
    expect(uow.events.published).toEqual([]);
  });

  it('keeps the branch when the producer does not change', async () => {
    const { uow, users, clock, stored } = withAppraisal({ branchId: undefined });
    const update = new UpdateAppraisal({ uow, users, clock });
    unwrap(await update.execute({ ...EDIT, rooms: 4 }, TEST_PRODUCER));
    expect(stored()?.branchId).toBeUndefined();
  });

  it('lets the assigned appraiser edit it', async () => {
    const { uow, users, clock, stored } = withAppraisal({ appraiserUserId: APPRAISER_ID });
    const update = new UpdateAppraisal({ uow, users, clock });
    unwrap(
      await update.execute({ ...EDIT, appraiserUserId: APPRAISER_ID, rooms: 4 }, TEST_APPRAISER),
    );
    expect(stored()?.rooms).toBe(4);
  });

  it("hides other people's appraisals without read-others", async () => {
    const { uow, users, clock } = withAppraisal();
    const update = new UpdateAppraisal({ uow, users, clock });
    expect(unwrapErr(await update.execute(EDIT, TEST_OTHER_AGENT))).toEqual({
      type: 'AppraisalNotFound',
    });
    unwrap(await update.execute({ ...EDIT, rooms: 7 }, TEST_MANAGER));
  });

  it('rejects editing a converted appraisal', async () => {
    const { uow, users, clock } = withAppraisal({ status: 'converted' });
    const update = new UpdateAppraisal({ uow, users, clock });
    expect(unwrapErr(await update.execute({ ...EDIT, rooms: 4 }, TEST_PRODUCER))).toEqual({
      type: 'AppraisalConverted',
    });
  });

  it('rejects removing the visit of a scheduled one', async () => {
    const { uow, users, clock } = withAppraisal({
      status: 'visit_scheduled',
      visitAt: new Date('2026-10-10T13:30:00.000Z'),
    });
    const update = new UpdateAppraisal({ uow, users, clock });
    expect(unwrapErr(await update.execute(EDIT, TEST_PRODUCER))).toEqual({
      type: 'VisitDateRequired',
    });
  });

  it('reports a missing appraisal and needs appraisals:update', async () => {
    const { uow, users, clock } = setup();
    const update = new UpdateAppraisal({ uow, users, clock });
    expect(unwrapErr(await update.execute(EDIT, TEST_PRODUCER))).toEqual({
      type: 'AppraisalNotFound',
    });
    expect(unwrapErr(await update.execute(EDIT, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('ChangeAppraisalStatus', () => {
  it('changes the status and records it', async () => {
    const sale = { minCents: 1n, maxCents: 2n, currency: 'USD' } as const;
    const { uow, clock, stored } = withAppraisal({
      result: { sale, rent: undefined, comparables: [], observations: undefined },
    });
    const change = new ChangeAppraisalStatus({ uow, clock });

    unwrap(await change.execute({ appraisalId: APPRAISAL_ID, status: 'appraised' }, TEST_PRODUCER));

    expect(stored()).toMatchObject({ status: 'appraised', statusChangedAt: TEST_NOW });
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'appraisals.appraisal_status_changed',
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'appraisal.status_changed',
        clientIds: [REQUESTER_ID],
        changes: { status: { before: 'requested', after: 'appraised' } },
      }),
    ]);
  });

  it('records nothing when the status is the same', async () => {
    const { uow, clock } = withAppraisal();
    const change = new ChangeAppraisalStatus({ uow, clock });
    unwrap(await change.execute({ appraisalId: APPRAISAL_ID, status: 'requested' }, TEST_PRODUCER));
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an invalid transition', async () => {
    const { uow, clock } = withAppraisal({ status: 'discarded' });
    const change = new ChangeAppraisalStatus({ uow, clock });
    expect(
      unwrapErr(
        await change.execute({ appraisalId: APPRAISAL_ID, status: 'appraised' }, TEST_PRODUCER),
      ),
    ).toEqual({ type: 'InvalidAppraisalTransition', from: 'discarded', to: 'appraised' });
  });

  it('needs a suggested value to mark it appraised', async () => {
    const { uow, clock } = withAppraisal();
    const change = new ChangeAppraisalStatus({ uow, clock });
    expect(
      unwrapErr(
        await change.execute({ appraisalId: APPRAISAL_ID, status: 'appraised' }, TEST_PRODUCER),
      ),
    ).toEqual({ type: 'AppraisalValueRequired' });
    expect(uow.audit.entries).toEqual([]);
  });

  it('needs the visit date to schedule the visit', async () => {
    const { uow, clock } = withAppraisal();
    const change = new ChangeAppraisalStatus({ uow, clock });
    expect(
      unwrapErr(
        await change.execute(
          { appraisalId: APPRAISAL_ID, status: 'visit_scheduled' },
          TEST_PRODUCER,
        ),
      ),
    ).toEqual({ type: 'VisitDateRequired' });
  });

  it('does not take converted as a manual status', async () => {
    const { uow, clock } = withAppraisal({ status: 'appraised' });
    const change = new ChangeAppraisalStatus({ uow, clock });
    const error = unwrapErr(
      await change.execute(
        // @ts-expect-error -- "Convertida" no es un estado manual: lo rechaza el contract.
        { appraisalId: APPRAISAL_ID, status: 'converted' },
        TEST_PRODUCER,
      ),
    );
    expect(error.type).toBe('InvalidInput');
  });

  it('checks permissions and who it belongs to', async () => {
    const { uow, clock } = withAppraisal();
    const change = new ChangeAppraisalStatus({ uow, clock });
    const input = { appraisalId: APPRAISAL_ID, status: 'discarded' as const };
    expect(unwrapErr(await change.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await change.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'AppraisalNotFound',
    });
  });
});

describe('DeleteAppraisal and RestoreAppraisal', () => {
  it('moves it to the trash and back, recording both', async () => {
    const { uow, clock, stored } = withAppraisal();
    const remove = new DeleteAppraisal({ uow, clock });
    const restore = new RestoreAppraisal({ uow, clock });

    unwrap(await remove.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER));
    expect(stored()).toMatchObject({ deletedAt: TEST_NOW, deletedBy: PRODUCER_ID });
    expect(unwrapErr(await remove.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER))).toEqual({
      type: 'AppraisalAlreadyDeleted',
    });

    unwrap(await restore.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER));
    expect(stored()?.deletedAt).toBeUndefined();
    expect(unwrapErr(await restore.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER))).toEqual({
      type: 'AppraisalNotDeleted',
    });

    expect(uow.audit.entries.map((e) => [e.action, e.clientIds])).toEqual([
      ['appraisal.deleted', [REQUESTER_ID]],
      ['appraisal.restored', [REQUESTER_ID]],
    ]);
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'appraisals.appraisal_deleted',
      'appraisals.appraisal_restored',
    ]);
  });

  it('needs appraisals:delete over an appraisal the user can see', async () => {
    const { uow, clock } = withAppraisal({ appraiserUserId: APPRAISER_ID });
    const remove = new DeleteAppraisal({ uow, clock });
    const restore = new RestoreAppraisal({ uow, clock });
    const input = { appraisalId: APPRAISAL_ID };
    expect(unwrapErr(await remove.execute(input, TEST_APPRAISER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await restore.execute(input, TEST_APPRAISER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await remove.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'AppraisalNotFound',
    });
    unwrap(await remove.execute(input, TEST_MANAGER));
  });
});
