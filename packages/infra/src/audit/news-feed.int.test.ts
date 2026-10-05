import { NEWS_KINDS, newsKindOf, type NewsFeedCriteria } from '@norde/core/audit';
import { Property, type PropertyId } from '@norde/core/properties';
import { parseId, type AuditChanges, type FieldChange, type Result } from '@norde/core/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { clients, clientTagAssignments, clientTags } from '../db/schema';
import { DrizzlePropertyRepository } from '../properties/drizzle-property-repository';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzleNewsFeedQuery } from './drizzle-news-feed-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const USER = '00000000-0000-7000-8000-0000000000a1';
const NORTH = '00000000-0000-7000-8000-0000000000b1';
const SOUTH = '00000000-0000-7000-8000-0000000000b2';
const NOW = new Date('2026-10-01T12:00:00Z');
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: USER, updatedBy: USER };

const ALL: NewsFeedCriteria = {
  kinds: NEWS_KINDS,
  branchId: undefined,
  offset: 0,
  limit: 10,
  entriesPerCard: 20,
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aProperty(code: string, branchId = NORTH): Promise<PropertyId> {
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
      producerUserId: USER,
      branchId,
      now: NOW,
    }),
  );
  await new DrizzlePropertyRepository(db, ids).save(property, USER);
  return property.id;
}

async function aClient(name: string, branchId = NORTH) {
  const id = ids.next();
  await db.insert(clients).values({ id, name, agentId: USER, branchId, ...stamps });
  return id;
}

/** Escribe en `audit_log` con la hora indicada, como lo hacen los casos de uso. */
async function record(
  entityType: 'property' | 'client',
  entityId: string,
  action: string,
  at: string,
  changes: AuditChanges = {},
) {
  const log = new DrizzleAuditLog(db, ids, { now: () => new Date(at) });
  await log.record({
    entityType,
    entityId,
    actorId: USER,
    action,
    kind: 'action',
    changes,
    source: 'gestion',
    clientIds: entityType === 'client' ? [entityId] : [],
  });
}

const sale = (priceCents: bigint | null, currency = 'USD') => ({
  operation: 'sale',
  currency,
  priceCents,
});
const rent = (priceCents: bigint | null) => ({ operation: 'rent', currency: 'ARS', priceCents });

/** Los mismos casos que el test de `newsKindOf`: el SQL tiene que clasificar igual. */
const OPERATION_EDITS: readonly FieldChange[] = [
  { before: [sale(12_000_000n)], after: [sale(12_800_000n)] },
  {
    before: [sale(12_000_000n), rent(50_000_000n)],
    after: [rent(50_000_000n), sale(11_000_000n)],
  },
  { before: [sale(null)], after: [sale(12_000_000n)] },
  { before: [sale(12_000_000n)], after: [sale(null)] },
  { before: [sale(12_000_000n)], after: [sale(12_000_000n, 'ARS')] },
  { before: [sale(12_000_000n)], after: [sale(12_000_000n), rent(50_000_000n)] },
  { before: [sale(12_000_000n), rent(50_000_000n)], after: [sale(11_000_000n)] },
  {
    before: [{ ...sale(12_000_000n), commissionPct: 3, priceOnRequest: false }],
    after: [{ ...sale(12_000_000n), commissionPct: 4, priceOnRequest: true }],
  },
  { before: null, after: [sale(12_000_000n)] },
];

describe('DrizzleNewsFeedQuery', () => {
  it('classifies operation edits like the domain does', async () => {
    const query = new DrizzleNewsFeedQuery(db);
    for (const [index, edit] of OPERATION_EDITS.entries()) {
      const propertyId = await aProperty(`NEWS${String(index)}`);
      await record('property', propertyId, 'property.updated', '2026-10-01T15:00:00Z', {
        operations: edit,
      });
      const page = await query.list(ALL);
      const card = page.items.find((item) => item.entityId === propertyId);
      expect(card?.entries.map((entry) => entry.kind) ?? []).toEqual(
        [newsKindOf('property.updated', { operations: edit })].filter((kind) => kind !== undefined),
      );
    }
  });

  it('groups by entity and day in Buenos Aires, newest card first, with the headers', async () => {
    const propertyId = await aProperty('NEWS100');
    const clientId = await aClient('Ana');
    const tag = ids.next();
    await db.insert(clientTags).values({ id: tag, name: 'Web', ...stamps });
    await db
      .insert(clientTagAssignments)
      .values({ clientId, tagId: tag, createdAt: NOW, createdBy: USER });
    await record('client', clientId, 'client.created', '2026-10-02T15:00:00Z');
    await record('property', propertyId, 'property.created', '2026-10-02T12:00:00Z');
    await record('property', propertyId, 'property.status_changed', '2026-10-02T13:00:00Z', {
      status: { before: 'loading', after: 'available' },
    });
    await record('property', propertyId, 'property.media_added', '2026-10-02T14:00:00Z');
    // 02:30 UTC del 3 es todavía el 2 en Buenos Aires: misma tarjeta que el alta.
    await record('client', clientId, 'client.reassigned', '2026-10-03T02:30:00Z', {
      agentId: { before: USER, after: USER },
    });

    const page = await new DrizzleNewsFeedQuery(db).list(ALL);

    expect(page.total).toBe(2);
    expect(
      page.items.map((card) => [
        card.entityType,
        card.day,
        card.entryCount,
        card.entries.map((e) => e.kind),
      ]),
    ).toEqual([
      ['client', '2026-10-02', 2, ['client.reassigned', 'client.created']],
      ['property', '2026-10-02', 2, ['property.status_changed', 'property.created']],
    ]);
    expect(page.items[0]?.header).toEqual({
      entityType: 'client',
      name: 'Ana',
      tags: [{ id: tag, name: 'Web', color: undefined }],
      deleted: false,
    });
    expect(page.items[1]?.header).toEqual({
      entityType: 'property',
      code: 'NEWS100',
      title: expect.any(String) as unknown,
      propertyType: 'apartment',
      neighborhood: 'Villa Luro',
      status: expect.any(String) as unknown,
      operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_800_000n }],
      deleted: false,
    });
    expect(page.items[1]?.entries[0]?.changes).toEqual({
      status: { before: 'loading', after: 'available' },
    });
  });

  it('paginates the cards, filters by kind and caps the entries of each card', async () => {
    const propertyId = await aProperty('NEWS200');
    const clientId = await aClient('Beto');
    for (const minute of [0, 1, 2]) {
      await record(
        'property',
        propertyId,
        'property.status_changed',
        `2026-10-02T12:0${String(minute)}:00Z`,
      );
    }
    await record('client', clientId, 'client.deleted', '2026-10-01T12:00:00Z');
    const query = new DrizzleNewsFeedQuery(db);

    const first = await query.list({ ...ALL, limit: 1, entriesPerCard: 2 });
    expect(first.total).toBe(2);
    expect(
      first.items.map((card) => [card.entityId, card.entries.length, card.entryCount]),
    ).toEqual([[propertyId, 2, 3]]);
    const second = await query.list({ ...ALL, offset: 1, limit: 1 });
    expect(second.items.map((card) => card.entityId)).toEqual([clientId]);

    const deleted = await query.list({ ...ALL, kinds: ['client.deleted'] });
    expect(deleted.items.map((card) => card.entityId)).toEqual([clientId]);
  });

  it('narrows the feed to the branch of each entity', async () => {
    const north = await aProperty('NEWS300', NORTH);
    const south = await aProperty('NEWS301', SOUTH);
    const southClient = await aClient('Caro', SOUTH);
    await record('property', north, 'property.created', '2026-10-02T12:00:00Z');
    await record('property', south, 'property.created', '2026-10-02T12:00:00Z');
    await record('client', southClient, 'client.created', '2026-10-02T12:00:00Z');
    const query = new DrizzleNewsFeedQuery(db);

    expect((await query.list({ ...ALL, branchId: NORTH })).items.map((c) => c.entityId)).toEqual([
      north,
    ]);
    expect((await query.list({ ...ALL, branchId: SOUTH })).total).toBe(2);
  });

  it('keeps the card of a deleted contact and skips entries that are not news', async () => {
    const clientId = await aClient('Dani');
    await record('client', clientId, 'client.note_added', '2026-10-02T11:00:00Z');
    await record('client', clientId, 'client.deleted', '2026-10-02T12:00:00Z');
    await db.execute(sql`update core.clients set deleted_at = ${NOW} where id = ${clientId}`);

    const page = await new DrizzleNewsFeedQuery(db).list(ALL);

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.entries.map((entry) => entry.action)).toEqual(['client.deleted']);
    expect(page.items[0]?.header).toMatchObject({ deleted: true });
  });
});
