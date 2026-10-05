import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  aListing,
  anInquiryItem,
  BRANCH_ID,
  InMemoryBranchNames,
  InMemoryClientAgents,
  InMemoryClientListings,
  PROPERTY_ID,
  StubInquiryInboxQuery,
} from '../../testing';

import { CountInquiriesByTab } from './count-inquiries-by-tab';
import { CountPendingInquiries } from './count-pending-inquiries';
import { ListInquiries } from './list-inquiries';

const READER = Actor.user('00000000-0000-7000-8000-0000000000c4', [
  'inquiries:read',
  'properties:read',
]);
const OUTSIDER = Actor.user('00000000-0000-7000-8000-0000000000c5', ['clients:read']);

function setup(items = [anInquiryItem()]) {
  const inbox = new StubInquiryInboxQuery(items);
  const listings = new InMemoryClientListings([
    aListing({ producer: { id: AGENT_ID, name: undefined } }),
  ]);
  const branches = new InMemoryBranchNames(new Map([[BRANCH_ID, 'Casa central']]));
  return {
    inbox,
    list: new ListInquiries({ inbox, listings, agents: new InMemoryClientAgents(), branches }),
    count: new CountPendingInquiries({ inbox }),
    countByTab: new CountInquiriesByTab({ inbox }),
  };
}

describe('ListInquiries', () => {
  it('pages a tab with its filters in the server', async () => {
    const { inbox, list } = setup();

    unwrap(
      await list.execute(
        {
          tab: 'assigned',
          branchId: BRANCH_ID,
          channel: 'zonaprop',
          propertyId: PROPERTY_ID.toUpperCase(),
          receivedFrom: '2026-03-01',
          receivedTo: '2026-03-02',
          page: '2',
          pageSize: '10',
          sort: 'receivedAt',
        },
        READER,
      ),
    );

    expect(inbox.searches).toEqual([
      {
        tab: 'assigned',
        branchId: BRANCH_ID,
        channel: 'zonaprop',
        propertyId: PROPERTY_ID,
        // Días de Buenos Aires (UTC-3), con el "hasta" inclusive.
        received: {
          from: new Date('2026-03-01T03:00:00Z'),
          to: new Date('2026-03-03T03:00:00Z'),
        },
        sort: { field: 'receivedAt', direction: 'asc' },
        offset: 10,
        limit: 10,
      },
    ]);
  });

  it('defaults to the pending tab, newest first', async () => {
    const { inbox, list } = setup();

    unwrap(await list.execute({}, READER));

    expect(inbox.searches[0]).toMatchObject({
      tab: 'pending',
      sort: { field: 'receivedAt', direction: 'desc' },
      offset: 0,
      limit: 25,
    });
  });

  it('shows the property with its producer, the branch, the agent and the tags', async () => {
    const { list } = setup([
      anInquiryItem({
        propertyId: PROPERTY_ID,
        branchId: BRANCH_ID,
        assignedAgentId: AGENT_ID,
        autoTags: ['channel:zonaprop', 'operation:sale', 'neighborhood:Villa Crespo', 'odd:x', 'y'],
      }),
    ]);

    const page = unwrap(await list.execute({}, READER));

    expect(page.items[0]).toMatchObject({
      property: { id: PROPERTY_ID, code: 'NOR-001', producer: { id: AGENT_ID, name: 'Camila' } },
      branch: { id: BRANCH_ID, name: 'Casa central' },
      assignedAgent: { id: AGENT_ID, name: 'Camila' },
      senderPhone: '+5491166899124',
      tags: [
        { kind: 'channel', value: 'zonaprop' },
        { kind: 'operation', value: 'sale' },
        { kind: 'neighborhood', value: 'Villa Crespo' },
      ],
    });
  });

  it('shows who deleted it, unless it was a system process', async () => {
    const deletedAt = new Date('2026-03-02T10:00:00Z');
    const { list } = setup([
      anInquiryItem({ status: 'deleted', deletedAt, deletedBy: AGENT_ID }),
      anInquiryItem({
        id: '00000000-0000-7000-8000-0000000000f2',
        status: 'deleted',
        deletedAt,
        deletedBy: 'system:import',
      }),
    ]);

    const page = unwrap(await list.execute({ tab: 'deleted' }, READER));

    expect(page.items.map((row) => row.deletedBy)).toEqual([
      { id: AGENT_ID, name: 'Camila' },
      undefined,
    ]);
  });

  it('suggests the opportunity type by the operations of the property', async () => {
    const { list } = setup([
      anInquiryItem({ autoTags: ['channel:zonaprop', 'operation:rent'] }),
      anInquiryItem({ id: '00000000-0000-7000-8000-0000000000f2' }),
    ]);

    const page = unwrap(await list.execute({}, READER));

    expect(page.items.map((row) => row.suggestedType)).toEqual(['rent', 'sale']);
  });

  it('needs "Ver consultas" and validates the query', async () => {
    const { list } = setup();

    expect(unwrapErr(await list.execute({}, OUTSIDER))).toEqual({ type: 'Forbidden' });
    // @ts-expect-error: una pestaña que no existe llega desde la URL.
    expect(unwrapErr(await list.execute({ tab: 'all' }, READER)).type).toBe('InvalidInput');
    expect(unwrapErr(await list.execute({ pageSize: 500 }, READER)).type).toBe('InvalidInput');
    expect(
      unwrapErr(
        await list.execute({ receivedFrom: '2026-03-05', receivedTo: '2026-03-01' }, READER),
      ).type,
    ).toBe('InvalidInput');
    expect(unwrapErr(await list.execute({ sort: 'senderName' }, READER)).type).toBe('InvalidInput');
  });
});

describe('CountPendingInquiries', () => {
  it('counts the unassigned inquiries for whoever can see them', async () => {
    const { inbox, count } = setup();
    inbox.pending = 4;

    expect(unwrap(await count.execute(READER))).toBe(4);
    expect(unwrap(await count.execute(OUTSIDER))).toBe(0);
    expect(unwrap(await count.execute(Actor.system('scheduler', ['inquiries:read'])))).toBe(0);
  });
});

describe('CountInquiriesByTab', () => {
  it('counts every tab with the inbox filters', async () => {
    const { inbox, countByTab } = setup();
    inbox.tabCounts = { pending: 3, assigned: 7, deleted: 1 };

    const counts = unwrap(
      await countByTab.execute(
        {
          branchId: BRANCH_ID,
          channel: 'zonaprop',
          propertyId: PROPERTY_ID.toUpperCase(),
          receivedFrom: '2026-05-01',
          receivedTo: '2026-05-01',
        },
        READER,
      ),
    );

    expect(counts).toEqual({ pending: 3, assigned: 7, deleted: 1 });
    expect(inbox.counts).toEqual([
      {
        branchId: BRANCH_ID,
        channel: 'zonaprop',
        propertyId: PROPERTY_ID,
        received: {
          from: new Date('2026-05-01T03:00:00Z'),
          to: new Date('2026-05-02T03:00:00Z'),
        },
      },
    ]);
  });

  it('rejects a reversed date range', async () => {
    const { countByTab } = setup();
    const error = unwrapErr(
      await countByTab.execute({ receivedFrom: '2026-05-02', receivedTo: '2026-05-01' }, READER),
    );
    expect(error.type).toBe('InvalidInput');
  });

  it('requires permission to see the inquiries', async () => {
    const { inbox, countByTab } = setup();
    expect(unwrapErr(await countByTab.execute({}, OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(inbox.counts).toEqual([]);
  });
});
