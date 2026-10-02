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
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
} from '../../testing';

import { CheckClientDuplicates } from './check-client-duplicates';
import { GetClientDetail } from './get-client-detail';
import { ListClientHistory } from './list-client-history';
import { ListClients } from './list-clients';

const agents = new InMemoryClientAgents();

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
    return { uow, useCase: new GetClientDetail({ uow, agents }) };
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
