import { MoveAgentBranchRecords } from '@norde/core/clients';
import { MoveProducerBranchRecords, Property } from '@norde/core/properties';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { createClientsUnitOfWork } from '../clients/clients-unit-of-work';
import { auditLog, clients, developments, opportunities, properties } from '../db/schema';
import { DrizzlePropertyRepository } from '../properties/drizzle-property-repository';
import { createPropertiesUnitOfWork } from '../properties/properties-unit-of-work';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

// Al cambiar de sucursal, lo que guarda una copia de la sucursal del dueño se mueve con él (#221).

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-11-14T12:00:00Z');
const NOW = clock.now();

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const OTHER_AGENT = '00000000-0000-7000-8000-0000000000a2';
const OLD_BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NEW_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b3';
const scheduler = Actor.system('scheduler', [
  'clients:move-user-branch',
  'properties:move-user-branch',
]);
const INPUT = { userId: AGENT, fromBranchId: OLD_BRANCH, toBranchId: NEW_BRANCH };

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aClient(agentId: string, branchId: string): Promise<string> {
  const id = ids.next();
  await db.insert(clients).values({
    id,
    name: 'Ana Pérez',
    kind: 'person',
    clientTypes: [],
    agentId,
    branchId,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: agentId,
    updatedBy: agentId,
  });
  return id;
}

async function anOpportunity(clientId: string, branchId: string): Promise<string> {
  const id = ids.next();
  await db.insert(opportunities).values({
    id,
    clientId,
    originChannel: 'whatsapp',
    type: 'sale',
    intent: 'visit',
    status: 'new',
    agentId: AGENT,
    branchId,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: AGENT,
    updatedBy: AGENT,
  });
  return id;
}

async function aProperty(code: string, producerUserId: string): Promise<string> {
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
      producerUserId,
      branchId: OLD_BRANCH,
      now: NOW,
    }),
  );
  await new DrizzlePropertyRepository(db, ids).save(property, producerUserId);
  return property.id;
}

async function aDevelopment(code: string): Promise<string> {
  const id = ids.next();
  await db.insert(developments).values({
    id,
    code,
    slug: code.toLowerCase(),
    name: 'Torre Norde',
    producerUserId: AGENT,
    branchId: OLD_BRANCH,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: AGENT,
    updatedBy: AGENT,
  });
  return id;
}

describe('moving a user records to their new branch', () => {
  it('moves contacts and opportunities still in the old branch and audits each one', async () => {
    const mine = await aClient(AGENT, OLD_BRANCH);
    const elsewhere = await aClient(AGENT, OTHER_BRANCH);
    const someoneElse = await aClient(OTHER_AGENT, OLD_BRANCH);
    const opportunity = await anOpportunity(mine, OLD_BRANCH);
    const handler = new MoveAgentBranchRecords({
      uow: createClientsUnitOfWork(db, { ids, clock }),
      clock,
    });

    const moved = unwrap(await handler.execute(INPUT, scheduler));

    expect(moved).toEqual({ clients: 1, opportunities: 1 });
    const rows = await db
      .select({ id: clients.id, branchId: clients.branchId, updatedBy: clients.updatedBy })
      .from(clients)
      .where(inArray(clients.id, [mine, elsewhere, someoneElse]));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.branchId]))).toEqual({
      [mine]: NEW_BRANCH,
      [elsewhere]: OTHER_BRANCH,
      [someoneElse]: OLD_BRANCH,
    });
    expect(rows.find((row) => row.id === mine)?.updatedBy).toBe('system:scheduler');
    const [movedOpportunity] = await db
      .select({ branchId: opportunities.branchId })
      .from(opportunities)
      .where(eq(opportunities.id, opportunity));
    expect(movedOpportunity?.branchId).toBe(NEW_BRANCH);
    const entries = await db
      .select({ action: auditLog.action, clientIds: auditLog.clientIds })
      .from(auditLog)
      .where(
        and(
          inArray(auditLog.entityId, [mine, opportunity]),
          inArray(auditLog.action, ['client.branch_changed', 'opportunity.branch_changed']),
        ),
      );
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.clientIds.includes(mine))).toBe(true);

    expect(unwrap(await handler.execute(INPUT, scheduler))).toEqual({
      clients: 0,
      opportunities: 0,
    });
  });

  it('moves properties and developments of the producer', async () => {
    const property = await aProperty('DEP0901', AGENT);
    const other = await aProperty('DEP0902', OTHER_AGENT);
    const development = await aDevelopment('EMP0901');
    const handler = new MoveProducerBranchRecords({
      uow: createPropertiesUnitOfWork(db, { ids, clock }),
      clock,
    });

    const moved = unwrap(await handler.execute(INPUT, scheduler));

    expect(moved).toEqual({ properties: 1, developments: 1 });
    const rows = await db
      .select({ id: properties.id, branchId: properties.branchId })
      .from(properties)
      .where(inArray(properties.id, [property, other]));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.branchId]))).toEqual({
      [property]: NEW_BRANCH,
      [other]: OLD_BRANCH,
    });
    const [movedDevelopment] = await db
      .select({ branchId: developments.branchId })
      .from(developments)
      .where(eq(developments.id, development));
    expect(movedDevelopment?.branchId).toBe(NEW_BRANCH);
  });
});
