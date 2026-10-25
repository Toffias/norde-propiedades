import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_PROPERTY_OWNERS } from '../../domain/property-owners';
import {
  BRANCH_ID,
  InMemoryPropertiesUnitOfWork,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { AddPropertyOwner } from './add-property-owner';
import { RemovePropertyOwner } from './remove-property-owner';

const CLIENT = '00000000-0000-7000-8000-0000000000d1';
const OTHER_CLIENT = '00000000-0000-7000-8000-0000000000d2';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000c2';
const TRASHED_PROPERTY = '00000000-0000-7000-8000-0000000000c3';

/** Edita su cartera, sin "cambiar el productor o los propietarios". */
const EDITOR = Actor.user(PRODUCER_ID, ['properties:read', 'properties:update']).withBranch(
  BRANCH_ID,
);
/** Cambia propietarios, pero solo de sus propiedades. */
const OWN_OWNERS = Actor.user(PRODUCER_ID, [
  'properties:update',
  'properties:change-producer',
]).withBranch(BRANCH_ID);

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
  uow.properties.rows.set(
    OTHER_PROPERTY,
    propertySnapshot({ id: OTHER_PROPERTY, code: 'CAS0002', producerUserId: OTHER_USER_ID }),
  );
  uow.properties.rows.set(
    TRASHED_PROPERTY,
    propertySnapshot({
      id: TRASHED_PROPERTY,
      code: 'CAS0003',
      deletedAt: TEST_NOW,
      deletedBy: OTHER_USER_ID,
    }),
  );
  uow.owners.clients.add(CLIENT);
  uow.owners.clients.add(OTHER_CLIENT);
  return {
    uow,
    add: new AddPropertyOwner({ uow }),
    remove: new RemovePropertyOwner({ uow }),
  };
}

describe('AddPropertyOwner', () => {
  it('links the client as owner and audits it against the property', async () => {
    const { uow, add } = setup();
    unwrap(await add.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, OWN_OWNERS));

    expect(uow.owners.rows.get(`${PROPERTY_ID}:${CLIENT}`)).toBe(PRODUCER_ID);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'property.owner_added',
        entityType: 'property',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT],
        actorId: PRODUCER_ID,
        changes: { clientId: { before: null, after: CLIENT } },
      }),
    ]);
  });

  it('does nothing when the client is already an owner', async () => {
    const { uow, add } = setup();
    await uow.owners.add(PROPERTY_ID, CLIENT, OTHER_USER_ID);
    unwrap(await add.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, TEST_MANAGER));

    expect(uow.owners.rows.get(`${PROPERTY_ID}:${CLIENT}`)).toBe(OTHER_USER_ID);
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects a client that does not exist, is in the trash or was merged', async () => {
    const { uow, add } = setup();
    uow.owners.clients.delete(CLIENT);
    expect(
      unwrapErr(await add.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, TEST_MANAGER)),
    ).toEqual({ type: 'OwnerClientNotFound' });
    expect(uow.owners.rows.size).toBe(0);
  });

  it('stops at the owners limit', async () => {
    const { uow, add } = setup();
    for (let i = 0; i < MAX_PROPERTY_OWNERS; i += 1) {
      await uow.owners.add(PROPERTY_ID, `client-${i.toString()}`, OTHER_USER_ID);
    }
    expect(
      unwrapErr(await add.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, TEST_MANAGER)),
    ).toEqual({ type: 'TooManyOwners', max: MAX_PROPERTY_OWNERS });
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects a property in the trash, a missing one and invalid input', async () => {
    const { add } = setup();
    expect(
      unwrapErr(
        await add.execute({ propertyId: TRASHED_PROPERTY, clientId: CLIENT }, TEST_MANAGER),
      ),
    ).toEqual({ type: 'PropertyInTrash' });
    expect(
      unwrapErr(
        await add.execute(
          { propertyId: '00000000-0000-7000-8000-0000000000c9', clientId: CLIENT },
          TEST_MANAGER,
        ),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
    expect(
      unwrapErr(await add.execute({ propertyId: PROPERTY_ID, clientId: 'nope' }, TEST_MANAGER)),
    ).toMatchObject({ type: 'InvalidInput' });
  });

  it('requires "cambiar el productor o los propietarios" and access to the property', async () => {
    const { uow, add } = setup();
    for (const actor of [EDITOR, TEST_OUTSIDER]) {
      expect(
        unwrapErr(await add.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, actor)),
      ).toEqual({ type: 'Forbidden' });
    }
    expect(
      unwrapErr(await add.execute({ propertyId: OTHER_PROPERTY, clientId: CLIENT }, OWN_OWNERS)),
    ).toEqual({ type: 'Forbidden' });
    expect(uow.owners.rows.size).toBe(0);
  });
});

describe('RemovePropertyOwner', () => {
  it('unlinks the owner and audits it against the property', async () => {
    const { uow, remove } = setup();
    await uow.owners.add(PROPERTY_ID, CLIENT, OTHER_USER_ID);
    await uow.owners.add(PROPERTY_ID, OTHER_CLIENT, OTHER_USER_ID);
    unwrap(await remove.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, OWN_OWNERS));

    expect([...uow.owners.rows.keys()]).toEqual([`${PROPERTY_ID}:${OTHER_CLIENT}`]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'property.owner_removed',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT],
        changes: { clientId: { before: CLIENT, after: null } },
      }),
    ]);
  });

  it('does nothing when the client was not an owner', async () => {
    const { uow, remove } = setup();
    unwrap(await remove.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, TEST_MANAGER));
    expect(uow.audit.entries).toHaveLength(0);
  });

  it('rejects a property in the trash, a missing one and invalid input', async () => {
    const { uow, remove } = setup();
    await uow.owners.add(TRASHED_PROPERTY, CLIENT, OTHER_USER_ID);
    expect(
      unwrapErr(
        await remove.execute({ propertyId: TRASHED_PROPERTY, clientId: CLIENT }, TEST_MANAGER),
      ),
    ).toEqual({ type: 'PropertyInTrash' });
    expect(uow.owners.rows.size).toBe(1);
    expect(
      unwrapErr(
        await remove.execute(
          { propertyId: '00000000-0000-7000-8000-0000000000c9', clientId: CLIENT },
          TEST_MANAGER,
        ),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
    expect(
      unwrapErr(await remove.execute({ propertyId: 'nope', clientId: CLIENT }, TEST_MANAGER)),
    ).toMatchObject({ type: 'InvalidInput' });
  });

  it('requires "cambiar el productor o los propietarios" and access to the property', async () => {
    const { uow, remove } = setup();
    await uow.owners.add(PROPERTY_ID, CLIENT, OTHER_USER_ID);
    await uow.owners.add(OTHER_PROPERTY, CLIENT, OTHER_USER_ID);
    for (const actor of [EDITOR, TEST_OUTSIDER]) {
      expect(
        unwrapErr(await remove.execute({ propertyId: PROPERTY_ID, clientId: CLIENT }, actor)),
      ).toEqual({ type: 'Forbidden' });
    }
    expect(
      unwrapErr(await remove.execute({ propertyId: OTHER_PROPERTY, clientId: CLIENT }, OWN_OWNERS)),
    ).toEqual({ type: 'Forbidden' });
    expect(uow.owners.rows.size).toBe(2);
  });
});
