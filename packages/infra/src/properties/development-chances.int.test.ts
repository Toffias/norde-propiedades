import {
  ReceiveInquiry,
  RouteInquiry,
  type ClientAgents,
  type InquiryPropertyLookup,
} from '@norde/core/clients';
import { Development, type DevelopmentId } from '@norde/core/properties';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { createClientsUnitOfWork } from '../clients/clients-unit-of-work';
import { clients, developmentAgentChances, developments, locations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzleDevelopmentChances } from './drizzle-development-chances';
import { DrizzleDevelopmentRepository } from './drizzle-development-repository';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-03T15:00:00Z');
const repository = new DrizzleDevelopmentRepository(db);
const chances = new DrizzleDevelopmentChances(db);

const PRODUCER = '00000000-0000-7000-8000-0000000000a9';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const A = '00000000-0000-7000-8000-0000000000a1';
const B = '00000000-0000-7000-8000-0000000000a2';
const INACTIVE = '00000000-0000-7000-8000-0000000000a3';
const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const WEB = Actor.system('web', ['inquiries:receive']);
const SCHEDULER = Actor.system('scheduler', ['inquiries:route']);

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(JSON.stringify(result.error));
  return result.value;
}

async function aDevelopment(code: string): Promise<Development> {
  const locationId = ids.next();
  await db.insert(locations).values({
    id: locationId,
    kind: 'neighborhood',
    name: 'Palermo',
    normalizedName: `palermo-${locationId}`,
    path: `/${locationId}/`,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: PRODUCER,
    updatedBy: PRODUCER,
  });
  const development = Development.create({
    id: unwrap(parseId<'Development'>(ids.next())),
    code,
    name: `Torre ${code}`,
    kind: 'building',
    privateAddress: 'Gurruchaga 1834',
    publishAddress: undefined,
    portalTitle: undefined,
    developerName: undefined,
    commercialContactClientId: undefined,
    locationId,
    coordinates: undefined,
    producerUserId: PRODUCER,
    branchId: BRANCH,
    now: NOW,
  });
  await repository.save(development, PRODUCER);
  return development;
}

async function load(id: DevelopmentId): Promise<Development> {
  const development = await repository.findById(id);
  if (!development) throw new Error('Development not found');
  return development;
}

describe('DrizzleDevelopmentRepository chances', () => {
  it('keeps the agents in their order and replaces them when they change', async () => {
    const development = await aDevelopment('EMP0101');
    unwrap(
      development.setChances(
        [
          { userId: B, weight: 1 },
          { userId: A, weight: 2 },
        ],
        LATER,
      ),
    );
    await repository.save(development, PRODUCER);
    expect((await load(development.id)).toSnapshot().chances).toEqual([
      { userId: B, weight: 1 },
      { userId: A, weight: 2 },
    ]);

    unwrap(development.setChances([{ userId: A, weight: 3 }], LATER));
    await repository.save(development, PRODUCER);
    const rows = await db
      .select()
      .from(developmentAgentChances)
      .where(eq(developmentAgentChances.developmentId, development.id))
      .orderBy(asc(developmentAgentChances.position));
    expect(rows.map((row) => [row.userId, row.weight, row.position])).toEqual([[A, 3, 0]]);

    unwrap(development.setChances([], LATER));
    await repository.save(development, PRODUCER);
    expect((await load(development.id)).toSnapshot().chances).toEqual([]);
  });

  it('goes away with the development', async () => {
    const development = await aDevelopment('EMP0102');
    unwrap(development.setChances([{ userId: A, weight: 1 }], LATER));
    await repository.save(development, PRODUCER);
    await db.delete(developments).where(eq(developments.id, development.id));
    expect(await db.select().from(developmentAgentChances)).toEqual([]);
  });
});

describe('DrizzleDevelopmentChances', () => {
  it('lists the agents in order, and none for a development in the trash or unknown', async () => {
    const development = await aDevelopment('EMP0103');
    unwrap(
      development.setChances(
        [
          { userId: B, weight: 1 },
          { userId: A, weight: 1 },
        ],
        LATER,
      ),
    );
    await repository.save(development, PRODUCER);
    expect(await chances.agentsOf(development.id)).toEqual([B, A]);
    expect(await chances.agentsOf(ids.next())).toEqual([]);
    expect(await chances.agentsOf('not-an-id')).toEqual([]);

    unwrap(development.delete(PRODUCER, 0, LATER));
    await repository.save(development, PRODUCER);
    expect(await chances.agentsOf(development.id)).toEqual([]);
    expect(await chances.takeTurn(development.id, new Set([A, B]))).toBeUndefined();
  });

  it('takes turns among the active agents without touching the modification date', async () => {
    const development = await aDevelopment('EMP0104');
    unwrap(
      development.setChances(
        [
          { userId: A, weight: 2 },
          { userId: INACTIVE, weight: 5 },
        ],
        LATER,
      ),
    );
    await repository.save(development, PRODUCER);

    expect(await chances.takeTurn(development.id, new Set([A]))).toBe(A);
    expect(await chances.takeTurn(development.id, new Set())).toBeUndefined();
    const [row] = await db.select().from(developments).where(eq(developments.id, development.id));
    expect(row).toMatchObject({ inquiryRouteCursor: 1n, updatedAt: LATER });
  });
});

describe('RouteInquiry by development chances (Postgres)', () => {
  const agents: ClientAgents = {
    names: () => Promise.resolve(new Map<string, string>()),
    find: (userId) => Promise.resolve([A, B].includes(userId) ? { branchId: BRANCH } : undefined),
  };

  it('distributes inquiries arriving at once by weight, without repeating a turn', async () => {
    const development = await aDevelopment('EMP0105');
    unwrap(
      development.setChances(
        [
          { userId: B, weight: 1 },
          { userId: A, weight: 2 },
        ],
        LATER,
      ),
    );
    await repository.save(development, PRODUCER);

    const uow = createClientsUnitOfWork(db, { ids, clock });
    // Una unidad del emprendimiento: la consulta toma su emprendimiento.
    const properties: InquiryPropertyLookup = {
      facts: () =>
        Promise.resolve({
          branchId: BRANCH,
          propertyType: 'apartment',
          operations: ['sale'],
          neighborhood: 'Palermo',
          developmentId: development.id,
        }),
    };
    const receive = new ReceiveInquiry({ uow, properties, ids, clock });
    // Con las reglas apagadas: la derivación por chances no depende de ellas.
    const route = new RouteInquiry({ uow, agents, ids, clock, rulesEnabled: false });

    const received = [];
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const { inquiryId } = unwrap(
        await receive.execute(
          {
            channel: 'zonaprop',
            externalId: `ZP-EMP-${String(n)}`,
            name: `Persona ${String(n)}`,
            phone: `+54 9 11 5555-01${String(n).padStart(2, '0')}`,
            propertyId: ids.next(),
          },
          WEB,
        ),
      );
      received.push(inquiryId);
    }

    const outcomes = await Promise.all(
      received.map((inquiryId) => route.execute({ inquiryId }, SCHEDULER)),
    );

    const assigned = outcomes.map((o) => {
      const value = unwrap(o);
      return value.routed ? value.agentId : undefined;
    });
    // B con 1 y A con 2: dos vueltas completas, sea cual sea el orden en que entraron.
    expect(assigned.filter((id) => id === A)).toHaveLength(4);
    expect(assigned.filter((id) => id === B)).toHaveLength(2);
    const [row] = await db.select().from(developments).where(eq(developments.id, development.id));
    expect(row?.inquiryRouteCursor).toBe(6n);
    expect(await db.select().from(clients)).toHaveLength(6);
  });
});
