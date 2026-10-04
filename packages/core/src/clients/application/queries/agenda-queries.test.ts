import { describe, expect, it } from 'vitest';

import { InMemoryAuditHistoryQuery } from '../../../audit/testing';
import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  aClientItem,
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  StubClientListQuery,
  StubClientRecordQuery,
  StubClientTagQuery,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
} from '../../testing';

import { CheckClientDuplicates } from './check-client-duplicates';
import { GetClientDetail } from './get-client-detail';
import { ListClientHistory } from './list-client-history';
import { ListClientLetters } from './list-client-letters';
import { ListClients } from './list-clients';

const agents = new InMemoryClientAgents();
const TAG_ID = '00000000-0000-7000-8000-0000000000e1';

describe('ListClients', () => {
  function setup(items = [aClientItem()]) {
    const list = new StubClientListQuery(items);
    return { list, useCase: new ListClients({ list, agents }) };
  }

  it('pages in the server with the filters and the visibility of the actor', async () => {
    const { list, useCase } = setup();

    const page = unwrap(
      await useCase.execute(
        {
          page: '2',
          pageSize: '10',
          sort: '-name',
          owners: 'true',
          createdFrom: '2026-03-01',
          createdTo: '2026-03-31',
        },
        TEST_AGENT,
      ),
    );

    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    expect(list.searches[0]).toMatchObject({
      offset: 10,
      limit: 10,
      sort: { field: 'name', direction: 'desc' },
      view: 'active',
      visibility: { kind: 'own', ownerId: AGENT_ID },
      anyOfTypes: ['owner_seller', 'owner_landlord'],
      created: {
        from: new Date('2026-03-01T03:00:00.000Z'),
        to: new Date('2026-04-01T03:00:00.000Z'),
      },
    });
  });

  it('sees the branch or everything according to the permissions', async () => {
    const { list, useCase } = setup();
    const branchReader = Actor.user(AGENT_ID, ['clients:read-branch']).withBranch(BRANCH_ID);

    unwrap(await useCase.execute({}, branchReader));
    unwrap(await useCase.execute({}, TEST_MANAGER));

    expect(list.searches.map((s) => s.visibility)).toEqual([
      { kind: 'branch', ownerId: AGENT_ID, branchId: BRANCH_ID },
      { kind: 'all' },
    ]);
  });

  it('names the agent and masks owners for who cannot see their data', async () => {
    const { useCase } = setup([
      aClientItem({ clientTypes: ['owner_seller'] }),
      aClientItem({ id: '00000000-0000-7000-8000-0000000000d2' }),
    ]);

    const masked = unwrap(await useCase.execute({}, TEST_AGENT)).items;
    expect(masked[0]).toMatchObject({
      contactMasked: true,
      phone: '+54 •••• 0000',
      mobile: '+54 •••• 9124',
      email: 'a•••@mail.com',
      agent: { id: AGENT_ID, name: 'Camila' },
    });
    expect(masked[1]).toMatchObject({ contactMasked: false, email: 'ana@mail.com' });

    const visible = unwrap(await useCase.execute({}, TEST_MANAGER)).items;
    expect(visible[0]).toMatchObject({ contactMasked: false, mobile: '+5491166899124' });
  });

  it('shows the trash only to who can delete', async () => {
    const { useCase } = setup();
    const reader = Actor.user(AGENT_ID, ['clients:read']);

    expect(unwrapErr(await useCase.execute({ view: 'trash' }, reader))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await useCase.execute({ view: 'trash' }, TEST_AGENT));
  });

  it('rejects invalid queries and actors without clients:read', async () => {
    const { useCase } = setup();
    expect(unwrapErr(await useCase.execute({ pageSize: '1000' }, TEST_AGENT)).type).toBe(
      'InvalidInput',
    );
    expect(unwrapErr(await useCase.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('GetClientDetail', () => {
  function setup() {
    const uow = new InMemoryClientsUnitOfWork();
    const tags = new StubClientTagQuery(
      [],
      [{ id: TAG_ID, name: 'Zonaprop', groupId: undefined, groupName: 'Origen', clients: 1 }],
    );
    const records = new StubClientRecordQuery();
    return { uow, records, useCase: new GetClientDetail({ uow, agents, tags, records }) };
  }

  it('returns the detail with what the actor can do', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { emails: ['ana@mail.com'] });

    const detail = unwrap(await useCase.execute({ clientId: client.id }, TEST_AGENT));

    expect(detail).toMatchObject({
      id: client.id,
      name: 'Ana Pérez',
      phones: [{ kind: 'mobile', number: '+5491166899124' }],
      emails: [{ kind: 'main', address: 'ana@mail.com' }],
      agent: { id: AGENT_ID, name: 'Camila' },
      contactMasked: false,
      can: { edit: true, rename: false, reassign: false, delete: true, viewHistory: true },
    });
  });

  it('brings the active opportunity and the tab counters', async () => {
    const { uow, records, useCase } = setup();
    const client = await seedClient(uow);
    const counts = { activity: 7, opportunities: 2, featured: 3, savedSearches: 1, relations: 4 };
    const active = {
      id: 'o1',
      type: 'sale',
      status: 'contacted' as const,
      stage: { id: 's1', name: 'Contactado', color: '#06b6d4' },
      createdAt: new Date('2026-03-01T10:00:00Z'),
      openCount: 2,
    };
    records.counts = counts;
    records.active = { ...active, agentId: AGENT_ID, branchId: BRANCH_ID };

    const detail = unwrap(await useCase.execute({ clientId: client.id }, TEST_AGENT));

    expect(detail.counts).toEqual(counts);
    // Sin permisos de oportunidades, la tarjeta no ofrece cambiar el estado ni reasignar.
    expect(detail.activeOpportunity).toEqual({
      ...active,
      agent: { id: AGENT_ID, name: 'Camila' },
      can: { update: false, reassign: false, moveTo: [], closeWith: [] },
    });
    expect(records.openStatuses).toEqual([
      ['new', 'contacted', 'visiting', 'negotiating', 'referred_to_partner'],
    ]);
  });

  it('masks the contact data and document of an owner', async () => {
    const { uow, useCase } = setup();
    const owner = await seedClient(uow, { clientTypes: ['owner_landlord'] });

    const detail = unwrap(await useCase.execute({ clientId: owner.id }, TEST_AGENT));

    expect(detail.contactMasked).toBe(true);
    expect(detail.phones[0]?.number).toBe('+54 •••• 9124');
  });

  it('cannot open a contact of another agent without seeing others', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });

    expect(unwrapErr(await useCase.execute({ clientId: client.id }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrap(await useCase.execute({ clientId: client.id }, TEST_MANAGER)).can).toEqual({
      edit: true,
      rename: true,
      reassign: true,
      delete: true,
      viewHistory: true,
      merge: true,
      erase: true,
    });
  });

  it('includes the tags of the contact', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);
    client.changeTags([TAG_ID], new Date('2026-02-03T10:00:00Z'));
    await uow.clients.save(client, AGENT_ID);

    const detail = unwrap(await useCase.execute({ clientId: client.id }, TEST_AGENT));

    expect(detail.tags).toEqual([{ id: TAG_ID, name: 'Zonaprop', groupName: 'Origen' }]);
    expect(detail.can.merge).toBe(false);
  });

  it('points to the principal when the contact was merged into another', async () => {
    const { uow, useCase } = setup();
    const primary = await seedClient(uow, { phones: ['+541147770000'] });
    const duplicate = await seedClient(uow);
    primary.absorb(duplicate, AGENT_ID, new Date('2026-02-03T10:00:00Z'));
    await uow.clients.save(duplicate, AGENT_ID);

    expect(unwrapErr(await useCase.execute({ clientId: duplicate.id }, TEST_AGENT))).toEqual({
      type: 'ClientMerged',
      clientId: primary.id,
    });
  });

  it('reports a missing contact, invalid input and actors without permission', async () => {
    const { useCase } = setup();
    expect(
      unwrapErr(
        await useCase.execute({ clientId: '00000000-0000-7000-8000-0000000000ff' }, TEST_AGENT),
      ),
    ).toEqual({ type: 'ClientNotFound' });
    expect(unwrapErr(await useCase.execute({ clientId: 'x' }, TEST_AGENT)).type).toBe(
      'InvalidInput',
    );
    expect(
      unwrapErr(
        await useCase.execute({ clientId: '00000000-0000-7000-8000-0000000000ff' }, TEST_OUTSIDER),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('CheckClientDuplicates', () => {
  function setup() {
    const uow = new InMemoryClientsUnitOfWork();
    return { uow, useCase: new CheckClientDuplicates({ uow, agents }) };
  }

  it('finds an existing contact of another agent without letting the actor open it', async () => {
    const { uow, useCase } = setup();
    const existing = await seedClient(uow, {
      phones: ['+541166899124'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });

    const result = unwrap(
      await useCase.execute({ name: 'Ana Pérez', phones: ['+5491166899124'] }, TEST_AGENT),
    );

    expect(result).toEqual({
      existing: {
        id: existing.id,
        name: 'Ana Pérez',
        agent: { id: OTHER_AGENT_ID, name: 'Martín' },
        trashed: false,
        canOpen: false,
      },
      possible: [],
    });
  });

  it('finds a trashed contact by email', async () => {
    const { uow, useCase } = setup();
    const trashed = await seedClient(uow, { emails: ['ana@mail.com'], deleted: true });

    const result = unwrap(await useCase.execute({ emails: ['ANA@mail.com'] }, TEST_AGENT));

    expect(result.existing).toMatchObject({ id: trashed.id, trashed: true, canOpen: true });
  });

  it('suggests possible duplicates by name and ignores half-typed data', async () => {
    const { uow, useCase } = setup();
    const sameName = await seedClient(uow, { name: 'ana pérez', phones: ['+541147770000'] });

    const result = unwrap(
      await useCase.execute({ name: 'Ana Pérez', phones: ['11 66'], emails: ['ana@'] }, TEST_AGENT),
    );

    expect(result.existing).toBeUndefined();
    expect(result.possible.map((p) => p.id)).toEqual([sameName.id]);
  });

  it('requires clients:create', async () => {
    const { useCase } = setup();
    expect(unwrapErr(await useCase.execute({ name: 'Ana' }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ListClientHistory', () => {
  function setup() {
    const uow = new InMemoryClientsUnitOfWork();
    const history = new InMemoryAuditHistoryQuery();
    return { uow, history, useCase: new ListClientHistory({ uow, history, agents }) };
  }

  it('pages the history of the contact with the name of who changed it', async () => {
    const { uow, history, useCase } = setup();
    const client = await seedClient(uow);
    history.entries.push({
      id: 'h1',
      entityType: 'client',
      entityId: client.id,
      occurredAt: new Date('2026-03-01T10:00:00Z'),
      actorId: AGENT_ID,
      source: 'gestion',
      action: 'client.updated',
      changes: { name: { before: 'Ana', after: 'Ana Pérez' } },
    });

    const page = unwrap(await useCase.execute({ clientId: client.id }, TEST_AGENT));

    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      action: 'client.updated',
      actor: { id: AGENT_ID, name: 'Camila' },
    });
    expect(history.criteria[0]).toMatchObject({ entityType: 'client', offset: 0, limit: 25 });
  });

  it('includes the history of the contacts merged into it', async () => {
    const { uow, history, useCase } = setup();
    const client = await seedClient(uow);
    const duplicate = await seedClient(uow);
    uow.clients.rows.set(duplicate.id, { ...duplicate.toSnapshot(), mergedIntoId: client.id });
    const entry = (id: string, entityId: string, day: string) => ({
      id,
      entityType: 'client',
      entityId,
      occurredAt: new Date(`${day}T10:00:00Z`),
      actorId: AGENT_ID,
      source: 'gestion',
      action: 'client.updated',
      changes: {},
    });
    history.entries.push(
      entry('own', client.id, '2026-03-02'),
      entry('merged', duplicate.id, '2026-03-01'),
      entry('other', '00000000-0000-7000-8000-0000000000ff', '2026-03-03'),
    );

    const page = unwrap(await useCase.execute({ clientId: client.id }, TEST_AGENT));

    expect(page.items.map((item) => item.id)).toEqual(['own', 'merged']);
    expect(history.criteria[0]).toMatchObject({ mergedEntityIds: [duplicate.id] });
  });

  it('shows the history of others only with audit:read-others', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });
    const reader = Actor.user(AGENT_ID, ['clients:read-all', 'audit:read']);

    expect(unwrapErr(await useCase.execute({ clientId: client.id }, reader))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await useCase.execute({ clientId: client.id }, TEST_MANAGER));
  });

  it('requires audit:read', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID });
    expect(unwrapErr(await useCase.execute({ clientId: client.id }, TEST_OTHER_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(
      unwrapErr(
        await useCase.execute({ clientId: '00000000-0000-7000-8000-0000000000ff' }, TEST_AGENT),
      ),
    ).toEqual({ type: 'ClientNotFound' });
  });
});

describe('ListClientLetters', () => {
  it('returns the 27 letters in order with the counts of the filtered contacts', async () => {
    const list = new StubClientListQuery();
    list.letterCounts = [
      { letter: 'M', count: 3 },
      { letter: 'A', count: 12 },
      { letter: '#', count: 1 },
    ];
    const useCase = new ListClientLetters({ list });

    const letters = unwrap(
      await useCase.execute({ tagged: 'with', letter: 'M', kind: 'company' }, TEST_AGENT),
    );

    expect(letters).toHaveLength(27);
    expect(letters[0]).toEqual({ letter: 'A', count: 12 });
    expect(letters[1]).toEqual({ letter: 'B', count: 0 });
    expect(letters[12]).toEqual({ letter: 'M', count: 3 });
    expect(letters[26]).toEqual({ letter: '#', count: 1 });
    // La letra elegida no filtra su propio índice.
    expect(list.letterCriteria[0]).toMatchObject({
      letter: undefined,
      tagged: 'with',
      kind: 'company',
      visibility: { kind: 'own', ownerId: AGENT_ID },
    });
  });

  it('rejects actors without clients:read, invalid filters and the trash without delete', async () => {
    const useCase = new ListClientLetters({ list: new StubClientListQuery() });
    expect(unwrapErr(await useCase.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    // @ts-expect-error: una letra que no está en el índice llega desde la URL.
    expect(unwrapErr(await useCase.execute({ letter: 'Ñ' }, TEST_AGENT)).type).toBe('InvalidInput');
    const reader = Actor.user(AGENT_ID, ['clients:read']);
    expect(unwrapErr(await useCase.execute({ view: 'trash' }, reader))).toEqual({
      type: 'Forbidden',
    });
  });
});
