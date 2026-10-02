import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  anInquiryMatch,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  InMemoryInquiryPropertyLookup,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  StubInquiryMatchQuery,
} from '../../testing';
import { ReceiveInquiry } from '../commands/receive-inquiry';

import { ListInquiryMatches } from './list-inquiry-matches';

const WEB = Actor.system('web', ['inquiries:receive']);
/** Ve los contactos de su sucursal. */
const MANAGER = Actor.user(AGENT_ID, [
  'inquiries:manage',
  'clients:read',
  'clients:read-branch',
]).withBranch(BRANCH_ID);
const READER = Actor.user(OTHER_AGENT_ID, ['inquiries:read']);

async function setup(items = [anInquiryMatch()]) {
  const uow = new InMemoryClientsUnitOfWork();
  const receive = new ReceiveInquiry({
    uow,
    properties: new InMemoryInquiryPropertyLookup(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock('2026-03-01T10:00:00Z'),
  });
  const { inquiryId } = unwrap(
    await receive.execute(
      {
        channel: 'zonaprop',
        externalId: 'ZP-1',
        phone: '+54 9 11 6689-9124',
        email: 'Ana@Example.com',
      },
      WEB,
    ),
  );
  const matches = new StubInquiryMatchQuery(items);
  return {
    inquiryId,
    matches,
    list: new ListInquiryMatches({ uow, matches, agents: new InMemoryClientAgents() }),
  };
}

describe('ListInquiryMatches', () => {
  it('searches by the normalized phone and email of the inquiry, paged in the server', async () => {
    const { inquiryId, matches, list } = await setup();

    unwrap(await list.execute({ inquiryId, page: 2, pageSize: 10 }, MANAGER));

    expect(matches.searches).toEqual([
      { phoneMatchKey: '+541166899124', email: 'ana@example.com', offset: 10, limit: 10 },
    ]);
  });

  it('shows the agent, the dates and whether the actor can open each client', async () => {
    const { inquiryId, list } = await setup([
      anInquiryMatch({ agentId: AGENT_ID, branchId: BRANCH_ID, matchedByEmail: true }),
      anInquiryMatch({
        id: '00000000-0000-7000-8000-0000000000a2',
        name: undefined,
        companyName: 'Inmobiliaria Sur',
        agentId: OTHER_AGENT_ID,
        branchId: OTHER_BRANCH_ID,
        lastContactAt: new Date('2026-02-20T15:00:00Z'),
        deletedAt: new Date('2026-02-21T15:00:00Z'),
      }),
    ]);

    const page = unwrap(await list.execute({ inquiryId }, MANAGER));

    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      {
        id: '00000000-0000-7000-8000-0000000000a1',
        name: 'Ana Pérez',
        agent: { id: AGENT_ID, name: 'Camila' },
        matchedByPhone: true,
        matchedByEmail: true,
        createdAt: new Date('2026-01-10T12:00:00Z'),
        lastContactAt: undefined,
        deleted: false,
        viewable: true,
      },
      {
        id: '00000000-0000-7000-8000-0000000000a2',
        name: 'Inmobiliaria Sur',
        agent: { id: OTHER_AGENT_ID, name: 'Martín' },
        matchedByPhone: true,
        matchedByEmail: false,
        createdAt: new Date('2026-01-10T12:00:00Z'),
        lastContactAt: new Date('2026-02-20T15:00:00Z'),
        deleted: true,
        // De otra sucursal: se puede asignar, pero no abrir su ficha.
        viewable: false,
      },
    ]);
  });

  it('reports an unknown inquiry', async () => {
    const { list } = await setup();

    expect(
      unwrapErr(await list.execute({ inquiryId: '00000000-0000-7000-8000-0000000000ff' }, MANAGER)),
    ).toEqual({ type: 'InquiryNotFound' });
  });

  it('rejects invalid input', async () => {
    const { list } = await setup();

    expect(unwrapErr(await list.execute({ inquiryId: 'x' }, MANAGER)).type).toBe('InvalidInput');
  });

  it('needs "Administrar consultas"', async () => {
    const { inquiryId, matches, list } = await setup();

    expect(unwrapErr(await list.execute({ inquiryId }, READER))).toEqual({ type: 'Forbidden' });
    expect(matches.searches).toEqual([]);
  });
});
