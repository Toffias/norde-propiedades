import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  StubClientRelationQuery,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OUTSIDER,
} from '../../testing';
import { ListClientRelations } from '../queries/list-client-relations';

import { LinkClients } from './link-clients';
import { UnlinkClients } from './unlink-clients';

const clock = new FixedClock('2026-03-10T12:00:00Z');
const MISSING = '00000000-0000-7000-8000-0000000000ff';

async function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const person = await seedClient(uow, { name: 'Juan Gómez' });
  const company = await seedClient(uow, {
    kind: 'company',
    name: 'Acme',
    phones: ['+541147770010'],
  });
  return {
    uow,
    person,
    company,
    link: new LinkClients({ uow, clock }),
    unlink: new UnlinkClients({ uow, clock }),
  };
}

describe('LinkClients', () => {
  it('links a person to a company and audits it against the person with both IDs', async () => {
    const { uow, person, company, link } = await setup();

    unwrap(
      await link.execute(
        { clientId: person.id, relatedClientId: company.id, kind: 'works_at', label: 'Gerente' },
        TEST_AGENT,
      ),
    );

    expect(uow.clients.rows.get(person.id)?.relations).toEqual([
      { relatedClientId: company.id, kind: 'works_at', label: 'Gerente' },
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'client.linked',
        entityType: 'client',
        entityId: person.id,
        clientIds: [person.id, company.id],
        changes: {
          relatedClientId: { before: null, after: company.id },
          relationKind: { before: null, after: 'works_at' },
          relationLabel: { before: null, after: 'Gerente' },
        },
      }),
    ]);
  });

  it('changes the label of an existing relation and ignores a repeated one', async () => {
    const { uow, person, company, link } = await setup();
    const input = { clientId: person.id, relatedClientId: company.id, kind: 'works_at' as const };

    unwrap(await link.execute({ ...input, label: 'Gerente' }, TEST_AGENT));
    unwrap(await link.execute({ ...input, label: 'Gerente' }, TEST_AGENT));
    unwrap(await link.execute({ ...input, label: 'Dueño' }, TEST_AGENT));

    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'client.linked',
      'client.relation_updated',
    ]);
    expect(uow.audit.entries[1]?.changes).toMatchObject({
      relationLabel: { before: 'Gerente', after: 'Dueño' },
    });
  });

  it('rejects invalid relations and missing contacts', async () => {
    const { person, company, link } = await setup();

    expect(
      unwrapErr(
        await link.execute(
          { clientId: company.id, relatedClientId: person.id, kind: 'works_at' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'InvalidRelation' });
    expect(
      unwrapErr(
        await link.execute(
          { clientId: person.id, relatedClientId: person.id, kind: 'related' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'SelfRelation' });
    expect(
      unwrapErr(
        await link.execute(
          { clientId: person.id, relatedClientId: MISSING, kind: 'related' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'ClientNotFound' });
  });

  it('needs to edit the contact and to see the other one', async () => {
    const { uow, person, link } = await setup();
    const hidden = await seedClient(uow, {
      kind: 'company',
      phones: ['+541147770011'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });

    expect(
      unwrapErr(
        await link.execute(
          { clientId: person.id, relatedClientId: hidden.id, kind: 'works_at' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await link.execute(
          { clientId: hidden.id, relatedClientId: person.id, kind: 'related' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(
      (
        await link.execute(
          { clientId: person.id, relatedClientId: hidden.id, kind: 'works_at' },
          TEST_MANAGER,
        )
      ).isOk(),
    ).toBe(true);
    expect(
      unwrapErr(
        await link.execute(
          { clientId: person.id, relatedClientId: hidden.id, kind: 'related' },
          TEST_OUTSIDER,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('UnlinkClients', () => {
  it('removes a relation from either contact, audited', async () => {
    const { uow, person, company, link, unlink } = await setup();
    const input = { clientId: person.id, relatedClientId: company.id, kind: 'works_at' as const };
    unwrap(await link.execute({ ...input, label: 'Gerente' }, TEST_AGENT));

    unwrap(await unlink.execute(input, TEST_AGENT));
    unwrap(await unlink.execute(input, TEST_AGENT));

    expect(uow.clients.rows.get(person.id)?.relations).toEqual([]);
    expect(uow.audit.entries.at(-1)).toMatchObject({
      action: 'client.unlinked',
      clientIds: [person.id, company.id],
      changes: {
        relatedClientId: { before: company.id, after: null },
        relationLabel: { before: 'Gerente', after: null },
      },
    });
    expect(uow.audit.entries).toHaveLength(2);
  });

  it('lets whoever edits the company remove an employee of another agent', async () => {
    const { uow, company, unlink } = await setup();
    const employee = await seedClient(uow, {
      phones: ['+541147770012'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    employee.link(
      { id: company.id, kind: 'company', isDeleted: false },
      'works_at',
      undefined,
      clock.now(),
    );
    await uow.clients.save(employee, OTHER_AGENT_ID);
    const input = { clientId: employee.id, relatedClientId: company.id, kind: 'works_at' as const };

    const third = Actor.user('00000000-0000-7000-8000-0000000000c9', [
      'clients:read',
      'clients:update',
    ]);
    expect(unwrapErr(await unlink.execute(input, third))).toEqual({ type: 'Forbidden' });
    unwrap(await unlink.execute(input, TEST_AGENT));

    expect(uow.clients.rows.get(employee.id)?.relations).toEqual([]);
  });

  it('rejects missing contacts and actors without permission', async () => {
    const { person, company, unlink } = await setup();
    const input = { clientId: person.id, relatedClientId: company.id, kind: 'works_at' as const };

    expect(unwrapErr(await unlink.execute({ ...input, clientId: MISSING }, TEST_AGENT))).toEqual({
      type: 'ClientNotFound',
    });
    expect(unwrapErr(await unlink.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('ListClientRelations', () => {
  it('lists both directions with what the actor can do on each', async () => {
    const { uow, person } = await setup();
    const relations = new StubClientRelationQuery([
      {
        direction: 'outgoing',
        kind: 'works_at',
        label: 'Gerente',
        other: { id: 'c1', name: 'Acme', kind: 'company', agentId: AGENT_ID, branchId: BRANCH_ID },
      },
      {
        direction: 'incoming',
        kind: 'related',
        label: undefined,
        other: {
          id: 'c2',
          name: 'Martín',
          kind: 'person',
          agentId: OTHER_AGENT_ID,
          branchId: OTHER_BRANCH_ID,
        },
      },
    ]);
    const useCase = new ListClientRelations({ uow, relations });

    const page = unwrap(await useCase.execute({ clientId: person.id, pageSize: 5 }, TEST_AGENT));

    expect(relations.criteria[0]).toEqual({
      clientId: person.id,
      direction: 'asc',
      offset: 0,
      limit: 5,
    });
    expect(page.items).toEqual([
      {
        direction: 'outgoing',
        kind: 'works_at',
        label: 'Gerente',
        other: { id: 'c1', name: 'Acme', kind: 'company' },
        canOpen: true,
        canUnlink: true,
      },
      {
        direction: 'incoming',
        kind: 'related',
        label: undefined,
        other: { id: 'c2', name: 'Martín', kind: 'person' },
        canOpen: false,
        canUnlink: true,
      },
    ]);
  });

  it('rejects contacts the actor cannot see', async () => {
    const { uow } = await setup();
    const hidden = await seedClient(uow, {
      phones: ['+541147770013'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    const useCase = new ListClientRelations({ uow, relations: new StubClientRelationQuery() });

    expect(unwrapErr(await useCase.execute({ clientId: hidden.id }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await useCase.execute({ clientId: MISSING }, TEST_AGENT))).toEqual({
      type: 'ClientNotFound',
    });
    expect(unwrapErr(await useCase.execute({ clientId: hidden.id }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});
