import {
  FallReservation,
  ListPropertyReservations,
  Property,
  ReserveProperty,
  SignReservation,
  UnlinkErasedClients,
  type Producers,
  type PropertyId,
} from '@norde/core/properties';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, clients, outbox, properties, reservations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzlePropertyClientErasure } from './drizzle-property-client-erasure';
import { DrizzlePropertyRepository } from './drizzle-property-repository';
import { DrizzlePropertyReservationsQuery } from './drizzle-property-reservations-query';
import { createPropertiesUnitOfWork } from './properties-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-04T15:00:00Z');
const repository = new DrizzlePropertyRepository(db, ids);
const uow = createPropertiesUnitOfWork(db, { ids, clock });

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const CLIENT = '00000000-0000-7000-8000-0000000000d1';
const OTHER_CLIENT = '00000000-0000-7000-8000-0000000000d2';
const NOW = new Date('2026-10-01T12:00:00Z');

const producers: Producers = { find: () => Promise.resolve({ branchId: BRANCH }) };
const reserve = new ReserveProperty({ uow, producers, clock, ids });
const AGENT_ACTOR = Actor.user(AGENT, [
  'properties:read',
  'reservations:read',
  'reservations:create',
]).withBranch(BRANCH);
const MANAGER = Actor.user('00000000-0000-7000-8000-0000000000a2', [
  'properties:read',
  'reservations:*',
]);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function anAvailableProperty(code: string): Promise<PropertyId> {
  const property = unwrap(
    Property.create({
      id: unwrap(parseId<'Property'>(ids.next())),
      code,
      kind: 'apartment',
      operation: { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
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
  unwrap(property.changeStatus('available', NOW));
  await repository.save(property, AGENT);
  return property.id;
}

async function aClient(id: string, name: string): Promise<void> {
  await db.insert(clients).values({
    id,
    name,
    kind: 'person',
    clientTypes: [],
    agentId: AGENT,
    branchId: BRANCH,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: AGENT,
    updatedBy: AGENT,
  });
}

async function statusOf(propertyId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: properties.status })
    .from(properties)
    .where(eq(properties.id, propertyId));
  return row?.status;
}

const input = (propertyId: string, clientId = CLIENT) => ({
  propertyId,
  clientId,
  operation: 'sale' as const,
  amount: '5000',
  currency: 'USD' as const,
  commissionPct: '3,5',
  commissionAmount: '4200',
  commissionCurrency: 'USD' as const,
  estimatedSigningDate: '2026-11-15',
});

describe('reservations', () => {
  it('reserves, falls and signs, changing the property in the same transaction', async () => {
    await aClient(CLIENT, 'Lucía Pérez');
    const propertyId = await anAvailableProperty('DEP0101');

    const first = unwrap(await reserve.execute(input(propertyId), AGENT_ACTOR));
    expect(await statusOf(propertyId)).toBe('reserved');
    const [row] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.id, first.reservationId));
    expect(row).toMatchObject({
      status: 'active',
      agentUserId: AGENT,
      branchId: BRANCH,
      amountCents: 500_000n,
      currency: 'USD',
      commissionPct: 3.5,
      commissionCents: 420_000n,
      commissionCurrency: 'USD',
      estimatedSigningDate: '2026-11-15',
      createdBy: AGENT,
    });

    unwrap(
      await new FallReservation({ uow, clock }).execute(
        { reservationId: first.reservationId, reason: 'Desistió' },
        MANAGER,
      ),
    );
    expect(await statusOf(propertyId)).toBe('available');

    const second = unwrap(await reserve.execute(input(propertyId), AGENT_ACTOR));
    unwrap(
      await new SignReservation({ uow, clock }).execute(
        { reservationId: second.reservationId },
        MANAGER,
      ),
    );
    expect(await statusOf(propertyId)).toBe('sold');

    const history = await db
      .select({ action: auditLog.action, clientIds: auditLog.clientIds })
      .from(auditLog)
      .where(eq(auditLog.entityId, propertyId));
    expect(history.map((entry) => entry.action).sort()).toEqual([
      'property.reservation_fallen',
      'property.reservation_signed',
      'property.reserved',
      'property.reserved',
    ]);
    expect(history.every((entry) => entry.clientIds.includes(CLIENT))).toBe(true);

    const list = new ListPropertyReservations({
      reservations: new DrizzlePropertyReservationsQuery(db),
      users: { names: () => Promise.resolve(new Map([[AGENT, 'Camila Ríos']])) },
    });
    const page = unwrap(await list.execute({ propertyId, pageSize: 1 }, AGENT_ACTOR));
    expect(page.total).toBe(2);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: second.reservationId,
        status: 'signed',
        client: { id: CLIENT, name: 'Lucía Pérez' },
        agent: { id: AGENT, name: 'Camila Ríos' },
        commission: { amountCents: 420_000n, currency: 'USD' },
      }),
    ]);
    const oldestFirst = unwrap(
      await list.execute({ propertyId, sort: 'reservedAt', page: 1, pageSize: 1 }, AGENT_ACTOR),
    );
    expect(oldestFirst.items.map((item) => item.status)).toEqual(['fallen']);
  });

  it('keeps one active reservation per property when two reserve at the same time', async () => {
    const propertyId = await anAvailableProperty('DEP0102');

    const results = await Promise.all([
      reserve.execute(input(propertyId), AGENT_ACTOR),
      reserve.execute(input(propertyId, OTHER_CLIENT), AGENT_ACTOR),
    ]);

    expect(results.filter((result) => result.isOk())).toHaveLength(1);
    expect(results.flatMap((result) => (result.isErr() ? [result.error.type] : []))).toEqual([
      expect.stringMatching(/^(PropertyAlreadyReserved|PropertyNotAvailable)$/),
    ]);
    expect(await db.select().from(reservations)).toHaveLength(1);
    expect(await db.select().from(auditLog)).toHaveLength(1);
    expect(
      (await db.select().from(outbox)).filter(
        (row) => row.eventType === 'properties.reservation_created',
      ),
    ).toHaveLength(1);
    expect(await statusOf(propertyId)).toBe('reserved');
  });

  it('deletes the reservations of an erased client and frees the reserved property', async () => {
    const propertyId = await anAvailableProperty('DEP0103');
    unwrap(await reserve.execute(input(propertyId), AGENT_ACTOR));

    const erase = new UnlinkErasedClients({
      erasure: new DrizzlePropertyClientErasure(db),
      uow,
      clock,
    });
    unwrap(
      await erase.execute(
        { clientIds: [CLIENT] },
        Actor.system('scheduler', ['properties:erase-client-data']),
      ),
    );

    expect(await db.select().from(reservations)).toEqual([]);
    expect(await statusOf(propertyId)).toBe('available');
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, propertyId));
    expect(entries.map((entry) => [entry.action, entry.clientIds])).toEqual(
      expect.arrayContaining([['property.reservation_erased', []]]),
    );
  });
});
