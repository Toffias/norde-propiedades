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
  TEST_AGENT,
  TEST_MANAGER,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
} from '../../testing';

import { UpdateClientDetails } from './update-client-details';

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const useCase = new UpdateClientDetails({ uow, clock: new FixedClock('2026-03-01T10:00:00Z') });
  return { uow, useCase };
}

describe('UpdateClientDetails', () => {
  it('saves a section and audits only what changed', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    unwrap(
      await useCase.execute(
        {
          clientId: client.id,
          clientTypes: ['tenant'],
          profile: { jobTitle: 'Contadora', country: '' },
        },
        TEST_AGENT,
      ),
    );

    expect(uow.clients.rows.get(client.id)).toMatchObject({
      clientTypes: ['tenant'],
      profile: { jobTitle: 'Contadora' },
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'client.updated',
        entityId: client.id,
        clientIds: [client.id],
        changes: {
          clientTypes: { before: null, after: ['tenant'] },
          jobTitle: { before: null, after: 'Contadora' },
        },
      }),
    ]);
  });

  it('saves the profile section whole: a missing field is cleared', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);
    unwrap(
      await useCase.execute({ clientId: client.id, profile: { companyName: 'Acme' } }, TEST_AGENT),
    );

    unwrap(
      await useCase.execute({ clientId: client.id, profile: { jobTitle: 'Gerente' } }, TEST_AGENT),
    );

    expect(uow.clients.rows.get(client.id)?.profile).toMatchObject({
      companyName: undefined,
      jobTitle: 'Gerente',
    });
  });

  it('does not audit nor save when nothing changed', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    unwrap(await useCase.execute({ clientId: client.id, kind: 'person' }, TEST_AGENT));

    expect(uow.audit.entries).toEqual([]);
  });

  it('replaces phones and emails, registered against the client', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    unwrap(
      await useCase.execute(
        {
          clientId: client.id,
          contact: {
            phones: [
              { kind: 'mobile', number: '+5491166899124' },
              { kind: 'work', number: '011 4777-0000', contactHours: 'Mañanas' },
            ],
            emails: [{ kind: 'work', address: 'ana@empresa.com' }],
          },
        },
        TEST_AGENT,
      ),
    );

    const [entry] = uow.audit.entries;
    expect(entry?.kind === 'updated' && Object.keys(entry.changes)).toEqual(['phones', 'emails']);
    expect(uow.clients.rows.get(client.id)?.phones.map((p) => p.phone.e164)).toEqual([
      '+5491166899124',
      '+541147770000',
    ]);
  });

  it('rejects a phone that another contact already uses', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);
    const other = await seedClient(uow, { phones: ['+541147770000'], deleted: true });

    const error = unwrapErr(
      await useCase.execute(
        {
          clientId: client.id,
          contact: { phones: [{ kind: 'main', number: '011 4777-0000' }], emails: [] },
        },
        TEST_AGENT,
      ),
    );

    expect(error).toEqual({ type: 'DuplicateClient', clientId: other.id, trashed: true });
  });

  it('renames only with clients:rename', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);

    expect(
      unwrapErr(await useCase.execute({ clientId: client.id, name: 'Otra' }, TEST_AGENT)),
    ).toEqual({ type: 'Forbidden' });

    unwrap(await useCase.execute({ clientId: client.id, name: 'Ana María' }, TEST_MANAGER));
    expect(uow.clients.rows.get(client.id)?.name).toBe('Ana María');
  });

  it('edits contacts of others only with clients:update-others', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });

    expect(
      unwrapErr(await useCase.execute({ clientId: client.id, kind: 'company' }, TEST_AGENT)),
    ).toEqual({ type: 'Forbidden' });
    unwrap(await useCase.execute({ clientId: client.id, kind: 'company' }, TEST_MANAGER));
  });

  it('does not let who cannot see an owner overwrite their contact data', async () => {
    const { uow, useCase } = setup();
    const owner = await seedClient(uow, { clientTypes: ['owner_seller'] });

    const error = unwrapErr(
      await useCase.execute(
        {
          clientId: owner.id,
          contact: { phones: [{ kind: 'main', number: '011 4777-0000' }], emails: [] },
        },
        TEST_AGENT,
      ),
    );

    expect(error).toEqual({ type: 'Forbidden' });
  });

  it('keeps the document of an owner that the actor sees masked', async () => {
    const { uow, useCase } = setup();
    const owner = await seedClient(uow, { clientTypes: ['owner_seller'] });
    unwrap(
      await useCase.execute(
        { clientId: owner.id, profile: { documentNumber: '20123456' } },
        TEST_MANAGER,
      ),
    );

    unwrap(
      await useCase.execute(
        { clientId: owner.id, profile: { jobTitle: 'Médica', documentNumber: '•••' } },
        TEST_AGENT,
      ),
    );

    expect(uow.clients.rows.get(owner.id)?.profile).toMatchObject({
      jobTitle: 'Médica',
      documentNumber: '20123456',
    });
  });

  it('does not edit a contact in the trash', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow, { deleted: true });

    expect(
      unwrapErr(await useCase.execute({ clientId: client.id, kind: 'company' }, TEST_AGENT)),
    ).toEqual({ type: 'ClientInTrash' });
  });

  it('reports a contact that does not exist and invalid input', async () => {
    const { useCase } = setup();
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: '00000000-0000-7000-8000-0000000000ff', kind: 'company' },
          TEST_AGENT,
        ),
      ),
    ).toEqual({ type: 'ClientNotFound' });
    expect(unwrapErr(await useCase.execute({ clientId: 'x' }, TEST_AGENT)).type).toBe(
      'InvalidInput',
    );
  });

  it('requires clients:update', async () => {
    const { uow, useCase } = setup();
    const client = await seedClient(uow);
    const readOnly = Actor.user(AGENT_ID, ['clients:read']).withBranch(BRANCH_ID);

    for (const actor of [TEST_OUTSIDER, readOnly, TEST_OTHER_AGENT]) {
      expect(
        unwrapErr(await useCase.execute({ clientId: client.id, kind: 'company' }, actor)),
      ).toEqual({ type: 'Forbidden' });
    }
  });
});
