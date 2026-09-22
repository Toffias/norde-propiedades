import type { PropertySearchCriteria } from '@norde/core/properties';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { properties } from '../db/schema';

import { DrizzlePropertySearchQuery } from './drizzle-property-search-query';

const db = useTestDatabase();
const query = new DrizzlePropertySearchQuery(db);
let sequence = 0;

async function insertProperty(overrides: Partial<typeof properties.$inferInsert> = {}) {
  sequence += 1;
  const row = {
    id: `00000000-0000-7000-8000-${sequence.toString().padStart(12, '0')}`,
    code: `P-${sequence}`,
    slug: `propiedad-${sequence}`,
    title: `Propiedad ${sequence}`,
    operation: 'rent',
    propertyType: 'apartment',
    status: 'available',
    publishedOnWeb: true,
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    priceCents: 60_000_000n,
    currency: 'ARS',
    rooms: 2,
    createdAt: new Date(Date.UTC(2026, 0, sequence)),
    updatedAt: new Date(Date.UTC(2026, 0, sequence)),
    ...overrides,
  };
  await db.insert(properties).values(row);
  return row;
}

const listed: PropertySearchCriteria = {
  statuses: ['available'],
  publishedOnWebOnly: true,
  offset: 0,
  limit: 10,
};

describe('DrizzlePropertySearchQuery', () => {
  it('returns only the requested statuses and published properties', async () => {
    await insertProperty({ title: 'Disponible' });
    await insertProperty({ title: 'Reservada', status: 'reserved' });
    await insertProperty({ title: 'Oculta', publishedOnWeb: false });

    const result = await query.search(listed);

    expect(result.total).toBe(1);
    expect(result.items.map((p) => p.title)).toEqual(['Disponible']);
  });

  it('matches the location by any word, ignoring accents and case', async () => {
    await insertProperty({ title: 'VL', neighborhood: 'Florida', city: 'Vicente López' });
    await insertProperty({ title: 'Palermo', neighborhood: 'Palermo' });

    const vicenteLopez = await query.search({ ...listed, location: 'vicente lopez' });
    const soho = await query.search({ ...listed, location: 'Palermo Soho' });

    expect(vicenteLopez.items.map((p) => p.title)).toEqual(['VL']);
    expect(soho.items.map((p) => p.title)).toEqual(['Palermo']);
  });

  it('filters by operation, type, currency, price and rooms', async () => {
    await insertProperty({ title: 'Barato', priceCents: 40_000_000n });
    await insertProperty({ title: 'Caro', priceCents: 90_000_000n });
    await insertProperty({ title: 'Venta', operation: 'sale', currency: 'USD' });
    await insertProperty({ title: 'Casa', propertyType: 'house' });
    await insertProperty({ title: 'Mono', rooms: 1 });

    const result = await query.search({
      ...listed,
      operation: 'rent',
      propertyType: 'apartment',
      currency: 'ARS',
      maxPriceCents: 70_000_000n,
      minRooms: 2,
    });

    expect(result.items.map((p) => p.title)).toEqual(['Barato']);
  });

  it('requires every amenity, with partial and accent-insensitive matches', async () => {
    await insertProperty({ title: 'Completo', amenities: ['Pileta climatizada', 'Balcón'] });
    await insertProperty({ title: 'Solo pileta', amenities: ['pileta'] });

    const result = await query.search({ ...listed, amenities: ['pileta', 'balcon'] });

    expect(result.items.map((p) => p.title)).toEqual(['Completo']);
  });

  it('paginates with the total and shows featured properties first', async () => {
    await insertProperty({ title: 'Vieja' });
    await insertProperty({ title: 'Nueva' });
    await insertProperty({ title: 'Destacada', featured: true });

    const first = await query.search({ ...listed, limit: 2 });
    const second = await query.search({ ...listed, offset: 2, limit: 2 });

    expect(first.total).toBe(3);
    expect(first.items.map((p) => p.title)).toEqual(['Destacada', 'Nueva']);
    expect(second.items.map((p) => p.title)).toEqual(['Vieja']);
  });

  it('maps a full record by id, including bigint money and decimal surfaces', async () => {
    const row = await insertProperty({
      priceCents: 15_000_000n,
      currency: 'USD',
      expensesCents: 9_500_000n,
      surfaceTotalM2: 48.5,
      amenities: ['cochera'],
      imageUrls: ['https://example.com/1.jpg'],
    });

    const record = await query.findById(row.id);

    expect(record).toMatchObject({
      id: row.id,
      priceCents: 15_000_000n,
      currency: 'USD',
      expensesCents: 9_500_000n,
      surfaceTotalM2: 48.5,
      amenities: ['cochera'],
      imageUrls: ['https://example.com/1.jpg'],
    });
    expect(await query.findById('00000000-0000-7000-8000-999999999999')).toBeUndefined();
  });
});
