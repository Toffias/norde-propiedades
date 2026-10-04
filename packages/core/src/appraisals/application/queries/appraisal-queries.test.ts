import { describe, expect, it } from 'vitest';

import { InMemoryAuditHistoryQuery } from '../../../audit/testing';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  APPRAISAL_ID,
  APPRAISER_ID,
  appraisalDetailItem,
  appraisalSnapshot,
  BRANCH_ID,
  InMemoryPanelDirectory,
  PRODUCER_ID,
  REQUESTER_ID,
  StubAppraisalQuery,
  TEST_APPRAISER,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import { GetAppraisal } from './get-appraisal';
import { ListAppraisalHistory } from './list-appraisal-history';
import { ListAppraisals } from './list-appraisals';

const directory = new InMemoryPanelDirectory({
  user: new Map([
    [PRODUCER_ID, 'Camila Díaz'],
    [APPRAISER_ID, 'Juan Gómez'],
  ]),
  branch: new Map([[BRANCH_ID, 'Centro']]),
});

const ITEM = appraisalDetailItem(appraisalSnapshot({ appraiserUserId: APPRAISER_ID }));

describe('ListAppraisals', () => {
  it('passes the filters to the query and resolves the names', async () => {
    const appraisals = new StubAppraisalQuery([ITEM]);
    const list = new ListAppraisals({ appraisals, directory });

    const page = unwrap(
      await list.execute(
        {
          status: 'pending',
          propertyType: 'house',
          producerId: PRODUCER_ID,
          createdFrom: '2026-10-01',
          createdTo: '2026-10-31',
          visitTo: '2026-10-15',
          sort: '-visitAt',
          pageSize: 10,
          page: 2,
        },
        TEST_PRODUCER,
      ),
    );

    expect(appraisals.requests).toEqual([
      {
        visibility: { kind: 'own', ownerId: PRODUCER_ID },
        deleted: false,
        statuses: ['requested', 'visit_scheduled'],
        propertyType: 'house',
        producerUserId: PRODUCER_ID,
        appraiserUserId: undefined,
        branchId: undefined,
        created: {
          from: new Date('2026-10-01T03:00:00.000Z'),
          to: new Date('2026-11-01T03:00:00.000Z'),
        },
        visit: { from: undefined, to: new Date('2026-10-16T03:00:00.000Z') },
        sort: { field: 'visitAt', direction: 'desc' },
        offset: 10,
        limit: 10,
      },
    ]);
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 1 });
  });

  it('returns the rows with names', async () => {
    const list = new ListAppraisals({ appraisals: new StubAppraisalQuery([ITEM]), directory });
    const page = unwrap(await list.execute({}, TEST_PRODUCER));
    expect(page.items).toEqual([
      expect.objectContaining({
        id: APPRAISAL_ID,
        code: 'TAS0001',
        requester: { id: REQUESTER_ID, name: 'Ana Pérez' },
        producer: { id: PRODUCER_ID, name: 'Camila Díaz' },
        appraiser: { id: APPRAISER_ID, name: 'Juan Gómez' },
        branch: { id: BRANCH_ID, name: 'Centro' },
      }),
    ]);
  });

  it('shows everything with read-others', async () => {
    const appraisals = new StubAppraisalQuery();
    const list = new ListAppraisals({ appraisals, directory });
    unwrap(await list.execute({}, TEST_MANAGER));
    expect(appraisals.requests[0]?.visibility).toEqual({ kind: 'all' });
  });

  it('opens the trash only with appraisals:delete', async () => {
    const appraisals = new StubAppraisalQuery();
    const list = new ListAppraisals({ appraisals, directory });
    unwrap(await list.execute({ view: 'trash' }, TEST_PRODUCER));
    expect(appraisals.requests[0]?.deleted).toBe(true);
    expect(unwrapErr(await list.execute({ view: 'trash' }, TEST_APPRAISER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('rejects invalid filters and a user without appraisals:read', async () => {
    const list = new ListAppraisals({ appraisals: new StubAppraisalQuery(), directory });
    const invalid = unwrapErr(
      await list.execute({ createdFrom: '2026-10-10', createdTo: '2026-10-01' }, TEST_PRODUCER),
    );
    expect(invalid.type).toBe('InvalidInput');
    expect(unwrapErr(await list.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('GetAppraisal', () => {
  it('returns the detail to the producer, the appraiser and management', async () => {
    const get = new GetAppraisal({ appraisals: new StubAppraisalQuery([ITEM]), directory });
    for (const actor of [TEST_PRODUCER, TEST_APPRAISER, TEST_MANAGER]) {
      const detail = unwrap(await get.execute({ appraisalId: APPRAISAL_ID }, actor));
      expect(detail).toMatchObject({ id: APPRAISAL_ID, rooms: 5, condition: 'good' });
    }
  });

  it("hides other people's appraisals without read-others", async () => {
    const get = new GetAppraisal({ appraisals: new StubAppraisalQuery([ITEM]), directory });
    expect(unwrapErr(await get.execute({ appraisalId: APPRAISAL_ID }, TEST_OTHER_AGENT))).toEqual({
      type: 'AppraisalNotFound',
    });
    expect(unwrapErr(await get.execute({ appraisalId: APPRAISAL_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('reports a missing appraisal', async () => {
    const get = new GetAppraisal({ appraisals: new StubAppraisalQuery(), directory });
    expect(unwrapErr(await get.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER))).toEqual({
      type: 'AppraisalNotFound',
    });
  });
});

describe('ListAppraisalHistory', () => {
  function history() {
    return new InMemoryAuditHistoryQuery([
      {
        id: 'h1',
        entityType: 'appraisal',
        entityId: APPRAISAL_ID,
        occurredAt: TEST_NOW,
        actorId: PRODUCER_ID,
        source: 'gestion',
        action: 'appraisal.created',
        changes: { status: { before: null, after: 'requested' } },
      },
      {
        id: 'h2',
        entityType: 'property',
        entityId: APPRAISAL_ID,
        occurredAt: TEST_NOW,
        actorId: PRODUCER_ID,
        source: 'gestion',
        action: 'property.created',
        changes: {},
      },
    ]);
  }

  it('lists the entries of the appraisal with the author name', async () => {
    const list = new ListAppraisalHistory({
      appraisals: new StubAppraisalQuery([ITEM]),
      history: history(),
      directory,
    });
    const page = unwrap(await list.execute({ appraisalId: APPRAISAL_ID }, TEST_PRODUCER));
    expect(page.items).toEqual([
      expect.objectContaining({
        id: 'h1',
        action: 'appraisal.created',
        actor: { id: PRODUCER_ID, name: 'Camila Díaz' },
      }),
    ]);
  });

  it("needs audit:read-others for someone else's appraisal", async () => {
    const list = new ListAppraisalHistory({
      appraisals: new StubAppraisalQuery([ITEM]),
      history: history(),
      directory,
    });
    const viewer = TEST_OTHER_AGENT;
    expect(unwrapErr(await list.execute({ appraisalId: APPRAISAL_ID }, viewer))).toEqual({
      type: 'AppraisalNotFound',
    });
    expect(unwrapErr(await list.execute({ appraisalId: APPRAISAL_ID }, TEST_APPRAISER))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await list.execute({ appraisalId: APPRAISAL_ID }, TEST_MANAGER));
  });
});
