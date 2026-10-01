import {
  matchesSavedSearch,
  type MatchableSearch,
  type PropertyInterestProfile,
} from '@norde/core/clients';
import { PropertyDocument, Property, type PropertyId } from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { DrizzleAuditHistoryQuery } from '../audit/drizzle-audit-history-query';
import { DrizzlePropertyInterestQuery } from '../clients/drizzle-property-interest-query';
import {
  clients,
  clientTagAssignments,
  clientTags,
  inquiries,
  portalAccounts,
  portalListingDailyStats,
  portalListings,
  propertyOwners,
  savedSearches,
  sharedListingItems,
  sharedListings,
} from '../db/schema';
import {
  DrizzlePropertyDocumentQuery,
  DrizzlePropertyDocumentRepository,
} from '../properties/drizzle-property-documents';
import { DrizzlePropertyDetailLookups } from '../properties/drizzle-property-detail-lookups';
import { DrizzlePropertyRepository } from '../properties/drizzle-property-repository';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzlePropertyStatisticsQuery } from './drizzle-property-statistics-query';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const USER = '00000000-0000-7000-8000-0000000000a1';
const OTHER_AGENT = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-10-01T12:00:00Z');
const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: USER, updatedBy: USER };

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
      producerUserId: USER,
      branchId: BRANCH,
      now: NOW,
    }),
  );
  await new DrizzlePropertyRepository(db, ids).save(property, USER);
  return property.id;
}

async function aClient(name: string, agentId: string | undefined = USER, branchId = BRANCH) {
  const id = ids.next();
  await db.insert(clients).values({ id, name, agentId, branchId, ...stamps });
  return id;
}

describe('DrizzlePropertyDetailLookups and documents', () => {
  it('returns the owners, the counts and who created the property', async () => {
    const propertyId = await aProperty('DEP0101');
    const ana = await aClient('Ana Pérez');
    await db
      .insert(propertyOwners)
      .values({ propertyId, clientId: ana, createdAt: NOW, createdBy: USER });
    const lookups = new DrizzlePropertyDetailLookups(db);
    expect(await lookups.owners(propertyId)).toEqual([{ id: ana, name: 'Ana Pérez' }]);
    expect(await lookups.counts(propertyId)).toEqual({ media: 0, attachments: 0 });
    expect(await lookups.createdBy(propertyId)).toBe(USER);
    expect(await lookups.cover(propertyId)).toBeUndefined();
  });

  it('round-trips a document and pages them newest first', async () => {
    const propertyId = await aProperty('DEP0102');
    const repository = new DrizzlePropertyDocumentRepository(db);
    const report = unwrap(
      PropertyDocument.request({
        id: unwrap(parseId<'PropertyDocument'>(ids.next())),
        propertyId,
        kind: 'owner_report',
        period: { from: '2026-09-01', to: '2026-09-30' },
        requestedBy: USER,
        now: NOW,
      }),
    );
    await repository.save(report, USER);
    report.complete(`properties/${propertyId}/documents/${report.id}`, NOW);
    await repository.save(report, USER);
    expect((await repository.findById(report.id))?.toSnapshot()).toEqual(report.toSnapshot());

    const sheet = unwrap(
      PropertyDocument.request({
        id: unwrap(parseId<'PropertyDocument'>(ids.next())),
        propertyId,
        kind: 'sheet',
        period: undefined,
        requestedBy: USER,
        now: new Date(NOW.getTime() + 1000),
      }),
    );
    await repository.save(sheet, USER);
    const page = await new DrizzlePropertyDocumentQuery(db).list({
      propertyId,
      offset: 0,
      limit: 1,
    });
    expect(page.total).toBe(2);
    expect(page.items).toMatchObject([{ id: sheet.id, kind: 'sheet', status: 'pending' }]);
  });
});

describe('DrizzleAuditHistoryQuery', () => {
  it('filters the history of a property by action, field, author and dates', async () => {
    const propertyId = await aProperty('DEP0201');
    const times = [0, 1, 2].map((day) => new Date(Date.UTC(2026, 8, 10 + day, 15)));
    let index = 0;
    const clock = { now: () => times[index] ?? NOW };
    const log = new DrizzleAuditLog(db, ids, clock);
    const base = {
      entityType: 'property',
      entityId: propertyId,
      source: 'gestion' as const,
      clientIds: [],
    };
    await log.record({
      ...base,
      actorId: USER,
      action: 'property.updated',
      kind: 'updated',
      changes: {
        operations: { before: [{ priceCents: 12_000_000n }], after: [{ priceCents: 11_000_000n }] },
      },
    });
    index = 1;
    await log.record({
      ...base,
      actorId: OTHER_AGENT,
      action: 'property.status_changed',
      kind: 'action',
      changes: { status: { before: 'draft', after: 'available' } },
    });
    index = 2;
    await log.record({ ...base, actorId: USER, action: 'property.media_added', kind: 'action' });

    const query = new DrizzleAuditHistoryQuery(db);
    const criteria = {
      entityType: 'property',
      entityId: propertyId,
      actions: undefined,
      fields: undefined,
      actorId: undefined,
      from: undefined,
      to: undefined,
      direction: 'desc' as const,
      offset: 0,
      limit: 10,
    };
    const all = await query.list(criteria);
    expect(all.items.map((entry) => entry.action)).toEqual([
      'property.media_added',
      'property.status_changed',
      'property.updated',
    ]);
    // Los centavos vuelven como bigint.
    expect(all.items[2]?.changes).toEqual({
      operations: { before: [{ priceCents: 12_000_000n }], after: [{ priceCents: 11_000_000n }] },
    });
    expect((await query.list({ ...criteria, fields: ['operations'] })).total).toBe(1);
    expect((await query.list({ ...criteria, actions: ['property.status_changed'] })).total).toBe(1);
    expect((await query.list({ ...criteria, actorId: OTHER_AGENT })).total).toBe(1);
    const range = await query.list({ ...criteria, from: times[1], to: times[2] });
    expect(range.items.map((entry) => entry.action)).toEqual(['property.status_changed']);
  });
});

describe('DrizzlePropertyInterestQuery', () => {
  const profile = (
    propertyId: string,
    locationIds: readonly string[] = [],
  ): PropertyInterestProfile => ({
    propertyId,
    propertyType: 'apartment',
    operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    locationIds,
    rooms: 3,
  });

  const SEARCHES: (MatchableSearch & { readonly name: string })[] = [
    {
      name: 'sin filtros',
      operation: 'sale',
      propertyTypes: [],
      currency: undefined,
      minPriceCents: undefined,
      maxPriceCents: undefined,
      locationIds: [],
      minRooms: undefined,
    },
    {
      name: 'alquiler',
      operation: 'rent',
      propertyTypes: [],
      currency: undefined,
      minPriceCents: undefined,
      maxPriceCents: undefined,
      locationIds: [],
      minRooms: undefined,
    },
    {
      name: 'casas',
      operation: 'sale',
      propertyTypes: ['house'],
      currency: undefined,
      minPriceCents: undefined,
      maxPriceCents: undefined,
      locationIds: [],
      minRooms: undefined,
    },
    {
      name: 'rango ok',
      operation: 'sale',
      propertyTypes: ['apartment'],
      currency: 'USD',
      minPriceCents: 10_000_000n,
      maxPriceCents: 12_000_000n,
      locationIds: [],
      minRooms: 2,
    },
    {
      name: 'muy caro',
      operation: 'sale',
      propertyTypes: [],
      currency: 'USD',
      minPriceCents: 20_000_000n,
      maxPriceCents: undefined,
      locationIds: [],
      minRooms: undefined,
    },
    {
      name: 'en pesos',
      operation: 'sale',
      propertyTypes: [],
      currency: 'ARS',
      minPriceCents: 1n,
      maxPriceCents: undefined,
      locationIds: [],
      minRooms: undefined,
    },
    {
      name: 'muchos ambientes',
      operation: 'sale',
      propertyTypes: [],
      currency: undefined,
      minPriceCents: undefined,
      maxPriceCents: undefined,
      locationIds: [],
      minRooms: 4,
    },
    {
      name: 'otro barrio',
      operation: 'sale',
      propertyTypes: [],
      currency: undefined,
      minPriceCents: undefined,
      maxPriceCents: undefined,
      locationIds: ['00000000-0000-7000-8000-00000000d0ff'],
      minRooms: undefined,
    },
    {
      name: 'en caba',
      operation: 'sale',
      propertyTypes: [],
      currency: undefined,
      minPriceCents: undefined,
      maxPriceCents: undefined,
      locationIds: ['00000000-0000-7000-8000-00000000d003'],
      minRooms: undefined,
    },
  ];

  async function withSearches() {
    const propertyId = await aProperty('DEP0301');
    const clientId = await aClient('Ana Pérez');
    for (const search of SEARCHES) {
      await db.insert(savedSearches).values({
        id: ids.next(),
        clientId,
        name: search.name,
        operation: search.operation,
        propertyTypes: [...search.propertyTypes],
        currency: search.currency ?? null,
        minPriceCents: search.minPriceCents ?? null,
        maxPriceCents: search.maxPriceCents ?? null,
        locationIds: [...search.locationIds],
        minRooms: search.minRooms ?? null,
        ...stamps,
      });
    }
    return { propertyId, clientId };
  }

  it('matches the same saved searches as the domain rule', async () => {
    const { propertyId } = await withSearches();
    const located = profile(propertyId, [
      '00000000-0000-7000-8000-00000000d001',
      '00000000-0000-7000-8000-00000000d003',
    ]);
    const page = await new DrizzlePropertyInterestQuery(db).interested({
      profile: located,
      visibility: { kind: 'all' },
      offset: 0,
      limit: 50,
    });
    const expected = SEARCHES.filter((search) => matchesSavedSearch(located, search)).map(
      (s) => s.name,
    );
    expect(page.items.map((item) => item.savedSearchName).sort()).toEqual([...expected].sort());
    expect(expected.sort()).toEqual(['en caba', 'rango ok', 'sin filtros']);
  });

  it('only shows the clients the actor can see', async () => {
    const { propertyId } = await withSearches();
    const other = await aClient(
      'Otro cliente',
      OTHER_AGENT,
      '00000000-0000-7000-8000-0000000000b2',
    );
    await db
      .insert(savedSearches)
      .values({ id: ids.next(), clientId: other, operation: 'sale', ...stamps });
    const query = new DrizzlePropertyInterestQuery(db);
    const own = await query.interested({
      profile: profile(propertyId),
      visibility: { kind: 'own', ownerId: USER },
      offset: 0,
      limit: 50,
    });
    expect(own.items.every((item) => item.clientName === 'Ana Pérez')).toBe(true);
    const all = await query.interested({
      profile: profile(propertyId),
      visibility: { kind: 'all' },
      offset: 0,
      limit: 50,
    });
    expect(all.total).toBe(own.total + 1);
    const none = await query.interested({
      profile: profile(propertyId),
      visibility: { kind: 'none' },
      offset: 0,
      limit: 50,
    });
    expect(none.total).toBe(0);
  });

  it('pages the sends of the property, newest first', async () => {
    const propertyId = await aProperty('DEP0302');
    const clientId = await aClient('Ana Pérez');
    for (const [day, channel] of [
      [1, 'email'],
      [2, 'whatsapp'],
    ] as const) {
      const id = ids.next();
      await db.insert(sharedListings).values({
        id,
        tokenHash: `hash-${id}`,
        clientId,
        channel,
        sentBy: USER,
        sentAt: new Date(Date.UTC(2026, 8, day, 15)),
        ...stamps,
      });
      await db.insert(sharedListingItems).values({
        sharedListingId: id,
        propertyId,
        openCount: day,
        reaction: day === 2 ? 'liked' : null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    const page = await new DrizzlePropertyInterestQuery(db).sends({
      propertyId,
      visibility: { kind: 'all' },
      offset: 0,
      limit: 10,
    });
    expect(page.items.map((item) => [item.channel, item.reaction, item.openCount])).toEqual([
      ['whatsapp', 'liked', 2],
      ['email', undefined, 1],
    ]);
  });
});

describe('DrizzlePropertyStatisticsQuery', () => {
  it('aggregates sends and inquiries by month of Buenos Aires, interested and portals', async () => {
    const propertyId = await aProperty('DEP0401');
    const clientId = await aClient('Ana Pérez');
    await db
      .insert(savedSearches)
      .values({ id: ids.next(), clientId, operation: 'sale', ...stamps });
    const tag = ids.next();
    await db.insert(clientTags).values({ id: tag, name: 'Inversor', ...stamps });
    await db
      .insert(clientTagAssignments)
      .values({ clientId, tagId: tag, createdAt: NOW, createdBy: USER });

    const send = async (sentAt: Date, channel: 'email' | 'whatsapp') => {
      const id = ids.next();
      await db
        .insert(sharedListings)
        .values({ id, tokenHash: `h-${id}`, clientId, channel, sentBy: USER, sentAt, ...stamps });
      await db
        .insert(sharedListingItems)
        .values({ sharedListingId: id, propertyId, createdAt: NOW, updatedAt: NOW });
    };
    // 1 de septiembre 01:00 UTC todavía es agosto en Buenos Aires.
    await send(new Date('2026-09-01T01:00:00Z'), 'email');
    await send(new Date('2026-09-10T15:00:00Z'), 'whatsapp');
    await send(new Date('2026-09-11T15:00:00Z'), 'whatsapp');
    await db.insert(inquiries).values({
      id: ids.next(),
      channel: 'zonaprop',
      receivedAt: new Date('2026-09-12T15:00:00Z'),
      propertyId,
      ...stamps,
    });
    await db
      .insert(portalAccounts)
      .values({ portal: 'zonaprop', ...stamps })
      .onConflictDoNothing();
    const listing = ids.next();
    await db
      .insert(portalListings)
      .values({ id: listing, portal: 'zonaprop', propertyId, status: 'published', ...stamps });
    for (const [date, views] of [
      ['2026-08-31', 50],
      ['2026-09-01', 10],
      ['2026-09-30', 5],
    ] as const) {
      await db
        .insert(portalListingDailyStats)
        .values({ listingId: listing, date, views, contacts: 1, createdAt: NOW, updatedAt: NOW });
    }

    const statistics = new DrizzlePropertyStatisticsQuery(db);
    const range = { from: new Date('2026-08-01T03:00:00Z'), to: new Date('2026-10-01T03:00:00Z') };
    expect(await statistics.monthly(propertyId, range)).toEqual([
      { month: '2026-08', emailSends: 1, whatsappSends: 0, inquiries: 0 },
      { month: '2026-09', emailSends: 0, whatsappSends: 2, inquiries: 1 },
    ]);
    const profile: PropertyInterestProfile = {
      propertyId,
      propertyType: 'apartment',
      operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
      locationIds: [],
      rooms: undefined,
    };
    expect(await statistics.interestedCount(profile)).toBe(1);
    expect(await statistics.interestedTags(profile, 10)).toEqual([
      { tagId: tag, name: 'Inversor', clients: 1 },
    ]);
    const september = {
      from: new Date('2026-09-01T03:00:00Z'),
      to: new Date('2026-10-01T03:00:00Z'),
    };
    expect(await statistics.publications(propertyId, september)).toMatchObject([
      { portal: 'zonaprop', status: 'published', views: 15, contacts: 2 },
    ]);
  });
});
