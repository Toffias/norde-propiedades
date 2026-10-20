import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientsUnitOfWork,
  seedClient,
} from '../../testing';

import { FindOrCreateOwner } from './find-or-create-owner';

const IMPORT_ACTOR = Actor.system('import', ['clients:create']);

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const owners = new FindOrCreateOwner({
    uow,
    agents: new InMemoryClientAgents(),
    ids: new SequentialIdGenerator(),
    clock: new FixedClock('2026-10-20T12:00:00Z'),
  });
  return { uow, owners };
}

const owner = {
  name: 'Ana Prueba',
  phone: '+5491166899124',
  email: undefined,
  sells: true,
  rents: false,
  agentId: AGENT_ID,
};

describe('FindOrCreateOwner', () => {
  it('creates the owner as a seller, assigned to the producer and audited', async () => {
    const { uow, owners } = setup();

    const { clientId } = unwrap(await owners.execute(owner, IMPORT_ACTOR)) ?? {};

    expect(uow.clients.rows.get(clientId ?? '')).toMatchObject({
      name: 'Ana Prueba',
      clientTypes: ['owner_seller'],
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    expect(uow.audit.entries.map((e) => e.action)).toEqual(['client.created']);
  });

  it('returns the contact that already has that phone or email, without changing it', async () => {
    const { uow, owners } = setup();
    const existing = await seedClient(uow, { name: 'Ana', emails: ['ana@mail.com'] });

    const found = unwrap(
      await owners.execute(
        { ...owner, phone: 'no es un teléfono', email: 'ANA@mail.com', rents: true },
        IMPORT_ACTOR,
      ),
    );

    expect(found).toEqual({ clientId: existing.id });
    expect(uow.clients.rows.size).toBe(1);
  });

  it('has no contact without a valid phone or email, and names an unnamed owner', async () => {
    const { uow, owners } = setup();

    expect(
      unwrap(await owners.execute({ ...owner, phone: '15', email: 'x@' }, IMPORT_ACTOR)),
    ).toBeUndefined();
    const created = unwrap(
      await owners.execute({ ...owner, name: ' ', sells: false, rents: true }, IMPORT_ACTOR),
    );
    expect(uow.clients.rows.get(created?.clientId ?? '')).toMatchObject({
      name: 'Propietario',
      clientTypes: ['owner_landlord'],
    });
  });

  it('requires clients:create', async () => {
    const { owners } = setup();

    expect(unwrapErr(await owners.execute(owner, Actor.system('import', [])))).toEqual({
      type: 'Forbidden',
    });
  });
});
