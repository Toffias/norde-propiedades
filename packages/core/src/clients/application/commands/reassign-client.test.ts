import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
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
} from '../../testing';

import { ReassignClient } from './reassign-client';

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const useCase = new ReassignClient({
    uow,
    agents: new InMemoryClientAgents(),
    clock: new FixedClock('2026-03-01T10:00:00Z'),
  });
  return { uow, useCase };
}

describe('ReassignClient', () => {
  it('moves the contact to the new agent and their branch, as an explicit action', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    unwrap(await useCase.execute({ clientId: client.id, agentId: OTHER_AGENT_ID }, TEST_MANAGER));

    expect(uow.clients.rows.get(client.id)).toMatchObject({
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'client.reassigned',
        clientIds: [client.id],
        changes: {
          agentId: { before: AGENT_ID, after: OTHER_AGENT_ID },
          branchId: { before: BRANCH_ID, after: OTHER_BRANCH_ID },
        },
      }),
    ]);
  });

  it('leaves the contact without an agent', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    unwrap(await useCase.execute({ clientId: client.id, agentId: null }, TEST_MANAGER));

    expect(uow.clients.rows.get(client.id)).toMatchObject({
      agentId: undefined,
      branchId: undefined,
    });
  });

  it('does nothing when the agent is the same', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    unwrap(await useCase.execute({ clientId: client.id, agentId: AGENT_ID }, TEST_MANAGER));

    expect(uow.audit.entries).toEqual([]);
  });

  it('reports a missing agent, a missing contact and a contact in the trash', async () => {
    const { uow, useCase } = setup();
    const trashed = await seedClient(uow, { deleted: true });
    const missing = '00000000-0000-7000-8000-0000000000ff';

    expect(
      unwrapErr(await useCase.execute({ clientId: trashed.id, agentId: missing }, TEST_MANAGER)),
    ).toEqual({ type: 'AgentNotFound' });
    expect(
      unwrapErr(await useCase.execute({ clientId: missing, agentId: AGENT_ID }, TEST_MANAGER)),
    ).toEqual({ type: 'ClientNotFound' });
    expect(
      unwrapErr(
        await useCase.execute({ clientId: trashed.id, agentId: OTHER_AGENT_ID }, TEST_MANAGER),
      ),
    ).toEqual({ type: 'ClientInTrash' });
  });

  it('requires clients:reassign and seeing the contact', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });
    const reassigner = Actor.user(AGENT_ID, ['clients:read', 'clients:reassign']).withBranch(
      BRANCH_ID,
    );

    expect(
      unwrapErr(await useCase.execute({ clientId: client.id, agentId: AGENT_ID }, TEST_AGENT)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await useCase.execute({ clientId: client.id, agentId: AGENT_ID }, reassigner)),
    ).toEqual({ type: 'Forbidden' });
  });
});
