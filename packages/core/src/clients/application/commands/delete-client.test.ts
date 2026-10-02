import { describe, expect, it } from 'vitest';

import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OUTSIDER,
} from '../../testing';

import { DeleteClient } from './delete-client';
import { RestoreClient } from './restore-client';

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const clock = new FixedClock('2026-03-01T10:00:00Z');
  return {
    uow,
    deleteClient: new DeleteClient({ uow, clock }),
    restoreClient: new RestoreClient({ uow, clock }),
  };
}

describe('DeleteClient', () => {
  it('sends the contact to the trash with who and when', async () => {
    const { uow, deleteClient } = setup();
    const client = await seedClient(uow);

    unwrap(await deleteClient.execute({ clientId: client.id }, TEST_AGENT));

    expect(uow.clients.rows.get(client.id)).toMatchObject({
      deletedAt: new Date('2026-03-01T10:00:00Z'),
      deletedBy: AGENT_ID,
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.client_deleted']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'client.deleted',
        entityId: client.id,
        clientIds: [client.id],
      }),
    ]);
  });

  it('deletes contacts of others only with clients:delete-others', async () => {
    const { uow, deleteClient } = setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });

    expect(unwrapErr(await deleteClient.execute({ clientId: client.id }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await deleteClient.execute({ clientId: client.id }, TEST_MANAGER));
  });

  it('reports an already deleted contact, a missing one and invalid input', async () => {
    const { uow, deleteClient } = setup();
    const trashed = await seedClient(uow, { deleted: true });

    expect(unwrapErr(await deleteClient.execute({ clientId: trashed.id }, TEST_AGENT))).toEqual({
      type: 'ClientAlreadyDeleted',
    });
    expect(
      unwrapErr(
        await deleteClient.execute(
          { clientId: '00000000-0000-7000-8000-0000000000ff' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'ClientNotFound' });
    expect(unwrapErr(await deleteClient.execute({ clientId: 'x' }, TEST_AGENT)).type).toBe(
      'InvalidInput',
    );
  });

  it('requires clients:delete', async () => {
    const { uow, deleteClient } = setup();
    const client = await seedClient(uow);
    expect(unwrapErr(await deleteClient.execute({ clientId: client.id }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('RestoreClient', () => {
  it('takes the contact out of the trash', async () => {
    const { uow, restoreClient } = setup();
    const client = await seedClient(uow, { deleted: true });

    unwrap(await restoreClient.execute({ clientId: client.id }, TEST_AGENT));

    expect(uow.clients.rows.get(client.id)?.deletedAt).toBeUndefined();
    expect(uow.events.published.map((e) => e.type)).toEqual(['clients.client_restored']);
    expect(uow.audit.entries.map((e) => e.action)).toEqual(['client.restored']);
  });

  it('reports a contact that is not deleted', async () => {
    const { uow, restoreClient } = setup();
    const client = await seedClient(uow);
    expect(unwrapErr(await restoreClient.execute({ clientId: client.id }, TEST_AGENT))).toEqual({
      type: 'ClientNotDeleted',
    });
  });

  it('restores contacts of others only with clients:delete-others', async () => {
    const { uow, restoreClient } = setup();
    const client = await seedClient(uow, {
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
      deleted: true,
    });

    expect(unwrapErr(await restoreClient.execute({ clientId: client.id }, TEST_AGENT))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await restoreClient.execute({ clientId: client.id }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await restoreClient.execute({ clientId: client.id }, TEST_MANAGER));
  });
});
