import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreateClientInput } from '../../contracts';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OUTSIDER,
} from '../../testing';

import { CreateClient } from './create-client';

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const useCase = new CreateClient({
    uow,
    agents: new InMemoryClientAgents(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock('2026-03-01T10:00:00Z'),
  });
  return { uow, useCase };
}

const input: CreateClientInput = {
  name: 'Ana Pérez',
  phones: [{ kind: 'mobile', number: '11 6689-9124', contactHours: 'de 9 a 13' }],
  emails: [{ kind: 'main', address: 'Ana@Mail.com' }],
  clientTypes: ['buyer'],
  profile: { companyName: 'Acme', birthDate: '1990-05-04' },
};

describe('CreateClient', () => {
  it('creates the contact in charge of the actor, with events and audit', async () => {
    const { uow, useCase } = setup();

    const { clientId } = unwrap(await useCase.execute(input, TEST_AGENT));

    const saved = uow.clients.rows.get(clientId);
    expect(saved).toMatchObject({
      name: 'Ana Pérez',
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
      clientTypes: ['buyer'],
      profile: { companyName: 'Acme', birthDate: '1990-05-04' },
    });
    expect(saved?.phones[0]?.phone.e164).toBe('+541166899124');
    expect(uow.clients.savedBy.get(clientId)).toBe(AGENT_ID);
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.client_registered']);
    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.audit.entries[0]).toMatchObject({
      kind: 'created',
      action: 'client.created',
      entityType: 'client',
      entityId: clientId,
      clientIds: [clientId],
      actorId: AGENT_ID,
      changes: {
        name: { before: null, after: 'Ana Pérez' },
        emails: { before: null, after: [{ kind: 'main', address: 'ana@mail.com' }] },
        agentId: { before: null, after: AGENT_ID },
        companyName: { before: null, after: 'Acme' },
      },
    });
  });

  it('does not create a duplicate when the phone already exists', async () => {
    const { uow, useCase } = setup();
    const existing = await seedClient(uow, {
      phones: ['+541166899124'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });

    const error = unwrapErr(await useCase.execute(input, TEST_AGENT));

    expect(error).toEqual({ type: 'DuplicateClient', clientId: existing.id, trashed: false });
    expect(uow.clients.rows.size).toBe(1);
    expect(uow.audit.entries).toEqual([]);
  });

  it('reports a match in the trash so it can be restored', async () => {
    const { uow, useCase } = setup();
    const existing = await seedClient(uow, {
      phones: ['+541147770000'],
      emails: ['ana@mail.com'],
      deleted: true,
    });

    const error = unwrapErr(await useCase.execute(input, TEST_AGENT));

    expect(error).toEqual({ type: 'DuplicateClient', clientId: existing.id, trashed: true });
  });

  it('assigns another agent only with clients:reassign', async () => {
    const { uow, useCase } = setup();

    expect(
      unwrapErr(await useCase.execute({ ...input, agentId: OTHER_AGENT_ID }, TEST_AGENT)),
    ).toEqual({ type: 'Forbidden' });

    const { clientId } = unwrap(
      await useCase.execute({ ...input, agentId: OTHER_AGENT_ID }, TEST_MANAGER),
    );
    expect(uow.clients.rows.get(clientId)).toMatchObject({
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
  });

  it('rejects an agent that does not exist', async () => {
    const { useCase } = setup();
    const error = unwrapErr(
      await useCase.execute(
        { ...input, agentId: '00000000-0000-7000-8000-0000000000ff' },
        TEST_MANAGER,
      ),
    );
    expect(error).toEqual({ type: 'AgentNotFound' });
  });

  it('validates the input and the contact data', async () => {
    const { useCase } = setup();

    expect(unwrapErr(await useCase.execute({ ...input, name: '' }, TEST_AGENT)).type).toBe(
      'InvalidInput',
    );
    expect(
      unwrapErr(
        await useCase.execute({ ...input, phones: [{ kind: 'main', number: '123' }] }, TEST_AGENT),
      ),
    ).toEqual({ type: 'InvalidPhone' });
    expect(
      unwrapErr(
        await useCase.execute(
          { ...input, emails: [{ kind: 'main', address: 'no-es-un-email' }] },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'InvalidEmail' });
    expect(
      unwrapErr(await useCase.execute({ ...input, phones: [], emails: [] }, TEST_AGENT)),
    ).toEqual({ type: 'MissingContactInfo' });
  });

  it('requires clients:create', async () => {
    const { useCase } = setup();
    expect(unwrapErr(await useCase.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});
