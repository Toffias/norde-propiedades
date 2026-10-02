import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  TEST_MANAGER,
} from '../../testing';

import { EraseClientData } from './erase-client-data';
import { MergeClients } from './merge-clients';

const clock = new FixedClock('2026-10-02T15:00:00Z');
const MISSING = '00000000-0000-7000-8000-0000000000ff';
/** Agente que puede suprimir los datos de sus contactos. */
const ERASER = Actor.user(AGENT_ID, ['clients:read', 'clients:erase']).withBranch(BRANCH_ID);

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const ids = new SequentialIdGenerator();
  return { uow, ids, useCase: new EraseClientData({ uow, ids, clock }) };
}

describe('EraseClientData', () => {
  it('erases the contact and its audit trail, and leaves a record without personal data', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { name: 'Ana Pérez' });
    const other = await seedClient(uow, { name: 'Juan Gómez', phones: ['+541147770000'] });
    uow.audit.entries.push(
      {
        kind: 'created',
        actorId: AGENT_ID,
        action: 'client.created',
        entityType: 'client',
        entityId: client.id,
        source: 'gestion',
        clientIds: [client.id],
        changes: { name: { before: null, after: 'Ana Pérez' } },
      },
      {
        kind: 'action',
        actorId: AGENT_ID,
        action: 'client.deleted',
        entityType: 'client',
        entityId: other.id,
        source: 'gestion',
        clientIds: [other.id],
      },
    );

    const result = unwrap(
      await useCase.execute(
        { clientId: client.id, confirmation: 'ana perez', requestedOn: '2026-09-30' },
        ERASER,
      ),
    );

    expect(result).toEqual({ erasedClientIds: [client.id] });
    expect(uow.clients.rows.has(client.id)).toBe(false);
    expect(uow.clients.rows.has(other.id)).toBe(true);
    expect(uow.erasure.records).toMatchObject([
      {
        erasedEntityType: 'client',
        erasedEntityId: client.id,
        requestedAt: new Date('2026-09-30T03:00:00Z'),
        executedBy: AGENT_ID,
        executedAt: clock.now(),
      },
    ]);
    expect(uow.events.published).toEqual([
      {
        type: 'clients.client_erased',
        aggregateId: client.id,
        occurredAt: clock.now(),
        payload: { clientId: client.id, erasedClientIds: [client.id] },
      },
    ]);
    // Queda la del otro contacto y la de la supresión, que no lleva clientIds.
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({ action: 'client.deleted', entityId: other.id }),
      {
        kind: 'action',
        actorId: AGENT_ID,
        action: 'client.erased',
        entityType: 'client',
        entityId: client.id,
        source: 'gestion',
        clientIds: [],
        changes: {
          erasedClients: { before: null, after: 1 },
          requestedOn: { before: null, after: '2026-09-30' },
        },
      },
    ]);
  });

  it('also erases the duplicates merged into the contact', async () => {
    const { uow, ids, useCase } = setup();
    const primary = await seedClient(uow, { name: 'Ana Pérez' });
    const duplicate = await seedClient(uow, { name: 'Ana P.', phones: ['+541147770000'] });
    const merge = new MergeClients({ uow, ids, clock });
    unwrap(await merge.execute({ primaryId: primary.id, duplicateId: duplicate.id }, TEST_MANAGER));

    const result = unwrap(
      await useCase.execute(
        { clientId: primary.id, confirmation: 'Ana Pérez', requestedOn: '2026-10-02' },
        TEST_MANAGER,
      ),
    );

    expect(result.erasedClientIds).toEqual([primary.id, duplicate.id]);
    expect(uow.clients.rows.size).toBe(0);
    expect(uow.audit.entries.map((e) => e.action)).toEqual(['client.erased']);
  });

  it('asks to type the contact name as a second confirmation', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { name: 'Ana Pérez' });

    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: client.id, confirmation: 'Ana', requestedOn: '2026-10-02' },
          ERASER,
        ),
      ),
    ).toEqual({ type: 'ErasureNotConfirmed' });
    expect(uow.clients.rows.has(client.id)).toBe(true);
    expect(uow.erasure.records).toEqual([]);
  });

  it('rejects a request dated in the future, a missing contact and invalid input', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { name: 'Ana Pérez' });

    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: client.id, confirmation: 'Ana Pérez', requestedOn: '2026-10-03' },
          ERASER,
        ),
      ),
    ).toEqual({ type: 'ErasureRequestInFuture' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: MISSING, confirmation: 'Ana Pérez', requestedOn: '2026-10-02' },
          ERASER,
        ),
      ),
    ).toEqual({ type: 'ClientNotFound' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: client.id, confirmation: 'Ana Pérez', requestedOn: 'ayer' },
          ERASER,
        ),
      ).type,
    ).toBe('InvalidInput');
    expect(uow.clients.rows.has(client.id)).toBe(true);
  });

  it('erases contacts in the trash too', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { name: 'Ana Pérez', deleted: true });

    unwrap(
      await useCase.execute(
        { clientId: client.id, confirmation: 'Ana Pérez', requestedOn: '2026-10-02' },
        ERASER,
      ),
    );

    expect(uow.clients.rows.has(client.id)).toBe(false);
  });

  it('requires clients:erase and being able to see the contact', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { name: 'Ana Pérez' });
    const othersClient = await seedClient(uow, {
      name: 'Juan Gómez',
      phones: ['+541147770000'],
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    const input = { clientId: client.id, confirmation: 'Ana Pérez', requestedOn: '2026-10-02' };
    const withoutErase = Actor.user(AGENT_ID, ['clients:read', 'clients:delete']);

    expect(unwrapErr(await useCase.execute(input, withoutErase))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: othersClient.id, confirmation: 'Juan Gómez', requestedOn: '2026-10-02' },
          ERASER,
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(uow.clients.rows.size).toBe(2);
  });
});
