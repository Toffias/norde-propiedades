import {
  AddPropertyOwner,
  MoveMergedClientLinks,
  Property,
  RemovePropertyOwner,
  UnlinkErasedClients,
  type PropertyId,
} from '@norde/core/properties';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, clients, propertyOwners } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzlePropertyClientErasure } from './drizzle-property-client-erasure';
import { DrizzlePropertyRepository } from './drizzle-property-repository';
import { createPropertiesUnitOfWork } from './properties-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-25T15:00:00Z');
const repository = new DrizzlePropertyRepository(db, ids);
const uow = createPropertiesUnitOfWork(db, { ids, clock });
const add = new AddPropertyOwner({ uow });
const remove = new RemovePropertyOwner({ uow });

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const CLIENT = '00000000-0000-7000-8000-0000000000d1';
const OTHER_CLIENT = '00000000-0000-7000-8000-0000000000d2';
const NOW = new Date('2026-10-01T12:00:00Z');
const MANAGER = Actor.user(AGENT, ['properties:*']).withBranch(BRANCH);
const SCHEDULER = Actor.system('scheduler', [
  'properties:erase-client-data',
  'properties:merge-client-data',
]);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aProperty(): Promise<string> {
  const property = unwrap(
    Property.create({
      id: unwrap(parseId<'Property'>(ids.next())),
      code: `CAS${ids.next().slice(-6)}`,
      kind: 'house',
      operation: { operation: 'sale', currency: 'USD', priceCents: 10_000_000n },
      address: {
        street: 'Gurruchaga',
        streetNumber: '1834',
        floor: undefined,
        unit: undefined,
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'Buenos Aires',
      },
      publishAddress: undefined,
      portalTitle: undefined,
      coordinates: undefined,
      locationId: undefined,
      producerUserId: AGENT,
      branchId: BRANCH,
      now: NOW,
    }),
  );
  await repository.save(property, AGENT);
  return property.id satisfies PropertyId;
}

async function aClient(
  id: string,
  state: { readonly deletedAt?: Date; readonly mergedIntoId?: string } = {},
) {
  await db.insert(clients).values({
    id,
    name: `Cliente ${id.slice(-2)}`,
    kind: 'person',
    clientTypes: ['owner_seller'],
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: AGENT,
    updatedBy: AGENT,
    ...state,
  });
}

async function ownersOf(propertyId: string) {
  const rows = await db
    .select({ clientId: propertyOwners.clientId, createdBy: propertyOwners.createdBy })
    .from(propertyOwners)
    .where(eq(propertyOwners.propertyId, propertyId));
  return rows;
}

async function historyOf(propertyId: string) {
  const rows = await db
    .select({ action: auditLog.action, clientIds: auditLog.clientIds })
    .from(auditLog)
    .where(eq(auditLog.entityId, propertyId));
  return rows;
}

describe('Property owners from the detail page (#107)', () => {
  it('adds and removes an owner with its history against the property', async () => {
    const propertyId = await aProperty();
    await aClient(CLIENT);

    unwrap(await add.execute({ propertyId, clientId: CLIENT }, MANAGER));
    unwrap(await add.execute({ propertyId, clientId: CLIENT }, MANAGER));
    expect(await ownersOf(propertyId)).toEqual([{ clientId: CLIENT, createdBy: AGENT }]);

    unwrap(await remove.execute({ propertyId, clientId: CLIENT }, MANAGER));
    expect(await ownersOf(propertyId)).toEqual([]);
    expect(await historyOf(propertyId)).toEqual([
      { action: 'property.owner_added', clientIds: [CLIENT] },
      { action: 'property.owner_removed', clientIds: [CLIENT] },
    ]);
  });

  it('rejects a contact in the trash, a merged one and a missing one', async () => {
    const propertyId = await aProperty();
    await aClient(CLIENT, { deletedAt: NOW });
    await aClient(OTHER_CLIENT, { mergedIntoId: CLIENT });

    for (const clientId of [CLIENT, OTHER_CLIENT, '00000000-0000-7000-8000-0000000000d9']) {
      const result = await add.execute({ propertyId, clientId }, MANAGER);
      expect(result.isErr() && result.error).toEqual({ type: 'OwnerClientNotFound' });
    }
    expect(await ownersOf(propertyId)).toEqual([]);
  });

  it('the erasure and the merge of contacts still find the owners added here', async () => {
    const erased = await aProperty();
    const merged = await aProperty();
    await aClient(CLIENT);
    await aClient(OTHER_CLIENT);
    unwrap(await add.execute({ propertyId: erased, clientId: CLIENT }, MANAGER));
    unwrap(await add.execute({ propertyId: merged, clientId: OTHER_CLIENT }, MANAGER));

    unwrap(
      await new UnlinkErasedClients({
        erasure: new DrizzlePropertyClientErasure(db),
        uow,
        clock,
      }).execute({ clientIds: [CLIENT] }, SCHEDULER),
    );
    expect(await ownersOf(erased)).toEqual([]);

    const moved = unwrap(
      await new MoveMergedClientLinks({ uow }).execute(
        { clientId: CLIENT, mergedClientId: OTHER_CLIENT },
        SCHEDULER,
      ),
    );
    expect(moved.propertyIds).toEqual([merged]);
    expect((await ownersOf(merged)).map((owner) => owner.clientId)).toEqual([CLIENT]);
  });
});
