import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MergeClients } from '@norde/core/clients';
import { MoveMergedClientConversations } from '@norde/core/conversations';
import { MoveMergedClientFavorites } from '@norde/core/identity';
import {
  MoveMergedClientLinks,
  Property,
  ReserveProperty,
  type PropertyId,
} from '@norde/core/properties';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { DrizzleAuditHistoryQuery } from '../audit/drizzle-audit-history-query';
import { createConversationsUnitOfWork } from '../conversations/conversations-unit-of-work';
import {
  auditLog,
  clients,
  conversations,
  developments,
  importMappings,
  outbox,
  propertyOwners,
  reservations,
  userFavorites,
  users,
} from '../db/schema';
import { createIdentityUnitOfWork } from '../identity/identity-unit-of-work';
import { createPropertiesUnitOfWork } from '../properties/properties-unit-of-work';
import { DrizzlePropertyRepository } from '../properties/drizzle-property-repository';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';

// Al unificar dos contactos, lo que otros módulos guardaban del duplicado pasa al que queda.

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-04T15:00:00Z');
const NOW = clock.now();

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const OTHER_USER = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const PRIMARY = '00000000-0000-7000-8000-0000000000d1';
const DUPLICATE = '00000000-0000-7000-8000-0000000000d2';
const DEVELOPMENT = '00000000-0000-7000-8000-0000000000e1';

const manager = Actor.user(AGENT, [
  'clients:*',
  'audit:*',
  'properties:read',
  'reservations:*',
]).withBranch(BRANCH);
const scheduler = Actor.system('scheduler', [
  'properties:merge-client-data',
  'conversations:merge-client-data',
  'identity:merge-client-data',
]);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aUser(id: string, email: string): Promise<void> {
  await db.insert(users).values({
    id,
    email,
    name: 'Usuario de prueba',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
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
  await new DrizzlePropertyRepository(db, ids).save(property, AGENT);
  return property.id;
}

async function anOwner(propertyId: string, clientId: string): Promise<void> {
  await db
    .insert(propertyOwners)
    .values({ propertyId, clientId, createdAt: NOW, createdBy: AGENT });
}

/** El duplicado con algo en cada módulo: reserva, propietario, emprendimiento, chat y favoritos. */
async function linkEverythingTo(clientId: string) {
  const reserved = await anAvailableProperty('DEP0301');
  const shared = await anAvailableProperty('DEP0302');
  const propertiesUow = createPropertiesUnitOfWork(db, { ids, clock });
  const reservation = unwrap(
    await new ReserveProperty({
      uow: propertiesUow,
      producers: { find: () => Promise.resolve({ branchId: BRANCH }) },
      clock,
      ids,
    }).execute({ propertyId: reserved, clientId, operation: 'sale' }, manager),
  );
  await anOwner(reserved, clientId);
  // Los dos son dueños de la misma: queda una sola fila.
  await anOwner(shared, clientId);
  await anOwner(shared, PRIMARY);
  await db.insert(developments).values({
    id: DEVELOPMENT,
    code: 'EMP0001',
    slug: 'emp-1',
    name: 'Torre Norde',
    commercialContactClientId: clientId,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: AGENT,
    updatedBy: AGENT,
  });
  const conversationId = ids.next();
  await db.insert(conversations).values({
    id: conversationId,
    channel: 'whatsapp',
    externalId: '5491166899199',
    clientId,
    status: 'open',
    startedAt: NOW,
    lastActivityAt: NOW,
  });
  await db.insert(userFavorites).values([
    { userId: AGENT, entityType: 'client', entityId: clientId, createdAt: NOW },
    { userId: OTHER_USER, entityType: 'client', entityId: clientId, createdAt: NOW },
    { userId: OTHER_USER, entityType: 'client', entityId: PRIMARY, createdAt: NOW },
  ]);
  await db.insert(importMappings).values({
    id: ids.next(),
    source: 'tokko',
    entityType: 'client',
    externalId: 'tokko-123',
    internalId: clientId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return { reserved, shared, reservationId: reservation.reservationId, conversationId };
}

async function expectEverythingOn(
  clientId: string,
  linked: Awaited<ReturnType<typeof linkEverythingTo>>,
): Promise<void> {
  const [reservation] = await db
    .select({ clientId: reservations.clientId })
    .from(reservations)
    .where(eq(reservations.id, linked.reservationId));
  expect(reservation?.clientId).toBe(clientId);
  const owners = await db
    .select({ propertyId: propertyOwners.propertyId, clientId: propertyOwners.clientId })
    .from(propertyOwners);
  expect(owners).toHaveLength(2);
  expect(owners.every((owner) => owner.clientId === clientId)).toBe(true);
  const [development] = await db
    .select({ contact: developments.commercialContactClientId })
    .from(developments)
    .where(eq(developments.id, DEVELOPMENT));
  expect(development?.contact).toBe(clientId);
  const [conversation] = await db
    .select({ clientId: conversations.clientId })
    .from(conversations)
    .where(eq(conversations.id, linked.conversationId));
  expect(conversation?.clientId).toBe(clientId);
  const favorites = await db.select().from(userFavorites);
  expect(favorites.map((f) => [f.userId, f.entityId]).sort()).toEqual(
    [
      [AGENT, clientId],
      [OTHER_USER, clientId],
    ].sort(),
  );
  const [mapping] = await db.select().from(importMappings);
  expect(mapping?.internalId).toBe(clientId);
}

describe('merging contacts moves what other modules keep', () => {
  it('moves reservations, owners, developments, conversations, favorites and the Tokko mapping', async () => {
    await aUser(AGENT, 'uno@example.com');
    await aUser(OTHER_USER, 'dos@example.com');
    await aClient(PRIMARY, 'Lucía Pérez');
    await aClient(DUPLICATE, 'Lucía P');
    const linked = await linkEverythingTo(DUPLICATE);

    unwrap(
      await new MergeClients({
        uow: createClientsUnitOfWork(db, { ids, clock }),
        ids,
        clock,
      }).execute({ primaryId: PRIMARY, duplicateId: DUPLICATE }, manager),
    );
    const [event] = await db
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.eventType, 'clients.clients_merged'));
    expect(event?.payload).toEqual({ clientId: PRIMARY, mergedClientId: DUPLICATE });

    // Lo que hace el agente al recibir el evento.
    const input = { clientId: PRIMARY, mergedClientId: DUPLICATE };
    const moved = unwrap(
      await new MoveMergedClientLinks({
        uow: createPropertiesUnitOfWork(db, { ids, clock }),
      }).execute(input, scheduler),
    );
    expect([...moved.propertyIds].sort()).toEqual([linked.reserved, linked.shared].sort());
    expect(moved.developmentIds).toEqual([DEVELOPMENT]);
    unwrap(
      await new MoveMergedClientConversations({
        uow: createConversationsUnitOfWork(db, { ids, clock }),
      }).execute(input, scheduler),
    );
    unwrap(
      await new MoveMergedClientFavorites({
        uow: createIdentityUnitOfWork(db, { ids, clock }),
      }).execute(input, scheduler),
    );

    await expectEverythingOn(PRIMARY, linked);
    const actions = await db
      .select({ action: auditLog.action, clientIds: auditLog.clientIds })
      .from(auditLog)
      .where(sql`${auditLog.action} like '%merged'`);
    expect(actions.map((a) => a.action).sort()).toEqual(
      [
        'client.merged',
        'conversation.client_merged',
        'development.client_merged',
        'property.client_merged',
        'property.client_merged',
        'user.favorites_merged',
        'user.favorites_merged',
      ].sort(),
    );

    // El historial del principal incluye el del duplicado.
    const history = await new DrizzleAuditHistoryQuery(db).list({
      entityType: 'client',
      entityId: PRIMARY,
      mergedEntityIds: [DUPLICATE],
      actions: ['client.merged_into'],
      fields: undefined,
      actorId: undefined,
      from: undefined,
      to: undefined,
      direction: 'desc',
      offset: 0,
      limit: 10,
    });
    expect(history.total).toBe(1);

    // Una segunda vez no encuentra nada que mover.
    const again = unwrap(
      await new MoveMergedClientLinks({
        uow: createPropertiesUnitOfWork(db, { ids, clock }),
      }).execute(input, scheduler),
    );
    expect(again).toEqual({ propertyIds: [], developmentIds: [] });
  });

  it('fixes the merges made before, following chains of merges', async () => {
    const LAST = '00000000-0000-7000-8000-0000000000d3';
    await aUser(AGENT, 'uno@example.com');
    await aUser(OTHER_USER, 'dos@example.com');
    await aClient(PRIMARY, 'Lucía Pérez');
    await aClient(DUPLICATE, 'Lucía P');
    await aClient(LAST, 'Lucía Pérez (final)');
    const linked = await linkEverythingTo(DUPLICATE);
    // Unificaciones viejas: el duplicado al principal, y el principal después a otro.
    await db
      .update(clients)
      .set({ mergedIntoId: PRIMARY, deletedAt: NOW, deletedBy: AGENT })
      .where(eq(clients.id, DUPLICATE));
    await db
      .update(clients)
      .set({ mergedIntoId: LAST, deletedAt: NOW, deletedBy: AGENT })
      .where(eq(clients.id, PRIMARY));

    const migration = readFileSync(
      path.resolve(import.meta.dirname, '../db/migrations/0029_merged_clients_backfill.sql'),
      'utf8',
    );
    for (let run = 0; run < 2; run += 1) {
      for (const statement of migration.split('--> statement-breakpoint')) {
        await db.execute(sql.raw(statement));
      }
    }

    await expectEverythingOn(LAST, linked);
  });
});
