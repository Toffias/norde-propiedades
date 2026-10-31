import type { ActorActivityCriteria } from '@norde/core/audit';
import { Property, type PropertyId } from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { clients } from '../db/schema';
import { DrizzlePropertyRepository } from '../properties/drizzle-property-repository';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzleActorActivityQuery } from './drizzle-actor-activity-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const CAMILA = '00000000-0000-7000-8000-0000000000a1';
const PEDRO = '00000000-0000-7000-8000-0000000000a2';
const NORTH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-10-01T12:00:00Z');
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: CAMILA, updatedBy: CAMILA };

const ALL: ActorActivityCriteria = {
  actorId: CAMILA,
  entityTypes: undefined,
  from: undefined,
  to: undefined,
  direction: 'desc',
  offset: 0,
  limit: 10,
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aProperty(code: string): Promise<PropertyId> {
  const property = unwrap(
    Property.create({
      id: unwrap(parseId<'Property'>(ids.next())),
      code,
      kind: 'apartment',
      operation: { operation: 'sale', currency: 'USD', priceCents: 12_800_000n },
      address: {
        street: 'Miralla',
        streetNumber: '745',
        floor: undefined,
        unit: undefined,
        neighborhood: 'Villa Luro',
        city: 'CABA',
        province: 'Buenos Aires',
      },
      publishAddress: undefined,
      portalTitle: undefined,
      coordinates: undefined,
      locationId: undefined,
      producerUserId: CAMILA,
      branchId: NORTH,
      now: NOW,
    }),
  );
  await new DrizzlePropertyRepository(db, ids).save(property, CAMILA);
  return property.id;
}

async function aClient(name: string) {
  const id = ids.next();
  await db.insert(clients).values({ id, name, agentId: CAMILA, branchId: NORTH, ...stamps });
  return id;
}

async function record(
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  at: string,
) {
  const log = new DrizzleAuditLog(db, ids, { now: () => new Date(at) });
  await log.record({
    entityType,
    entityId,
    actorId,
    action,
    kind: 'action',
    changes: {},
    source: 'gestion',
    clientIds: entityType === 'client' ? [entityId] : [],
  });
}

describe('DrizzleActorActivityQuery', () => {
  it('lists what one user did, newest first, naming each entity', async () => {
    const property = await aProperty('P-ACT-1');
    const client = await aClient('Ana Activity');
    await record(CAMILA, 'property', property, 'property.created', '2026-10-01T10:00:00Z');
    await record(CAMILA, 'client', client, 'client.created', '2026-10-02T10:00:00Z');
    await record(CAMILA, 'user', CAMILA, 'user.signed-in', '2026-10-03T10:00:00Z');
    await record(PEDRO, 'property', property, 'property.updated', '2026-10-04T10:00:00Z');

    const query = new DrizzleActorActivityQuery(db);
    const page = await query.list(ALL);

    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.action)).toEqual([
      'user.signed-in',
      'client.created',
      'property.created',
    ]);
    expect(page.items[1]?.entity).toMatchObject({ name: 'Ana Activity', deleted: false });
    expect(page.items[2]?.entity).toMatchObject({ code: 'P-ACT-1', deleted: false });
    // El usuario no está en `users` en este test: queda sin nombre.
    expect(page.items[0]?.entity).toBeUndefined();
  });

  it('filters by included or excluded entity types and by dates, paginating in the base', async () => {
    const client = await aClient('Beto Activity');
    await record(CAMILA, 'client', client, 'client.updated', '2026-09-01T10:00:00Z');
    await record(CAMILA, 'branch', NORTH, 'branch.updated', '2026-09-02T10:00:00Z');
    await record(CAMILA, 'role', 'role-1', 'role.updated', '2026-09-03T10:00:00Z');
    const query = new DrizzleActorActivityQuery(db);

    const included = await query.list({ ...ALL, entityTypes: { include: ['client'] } });
    expect(included.items.map((item) => item.entityType)).toEqual(['client']);

    const excluded = await query.list({
      ...ALL,
      entityTypes: { exclude: ['client', 'branch'] },
      limit: 1,
    });
    expect(excluded.total).toBe(1);
    expect(excluded.items.map((item) => item.entityId)).toEqual(['role-1']);

    const ranged = await query.list({
      ...ALL,
      from: new Date('2026-09-02T00:00:00Z'),
      to: new Date('2026-09-03T00:00:00Z'),
    });
    expect(ranged.items.map((item) => item.action)).toEqual(['branch.updated']);
  });

  it('has the actor indexes for the author filters', async () => {
    const indexes = await db.execute(sql`
      select indexname from pg_indexes
      where schemaname = 'core' and tablename = 'audit_log' and indexname like 'audit_log_actor_%'
      order by indexname
    `);
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      'audit_log_actor_entity_type_occurred_idx',
      'audit_log_actor_occurred_idx',
    ]);
  });
});
