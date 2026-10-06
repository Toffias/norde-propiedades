import type { PropertySearchCriteria } from '@norde/core/properties';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import {
  features,
  locations,
  mediaItems,
  properties,
  propertyFeatures,
  propertyOperations,
} from '../db/schema';

import { DrizzlePropertySearchQuery } from './drizzle-property-search-query';

const db = useTestDatabase();
const query = new DrizzlePropertySearchQuery(db);
let sequence = 0;

const AUTHOR = 'system:import';
const POOL = '00000000-0000-7000-8002-000000000001';
const GRILL = '00000000-0000-7000-8002-000000000002';
const GAS = '00000000-0000-7000-8002-000000000003';

/** Cada test arranca con las tablas vacías: el catálogo también. */
async function insertCatalog() {
  const at = new Date();
  await db.insert(features).values(
    [
      { id: POOL, kind: 'amenity', key: 'amenity-pileta', name: 'Pileta', position: 0 },
      { id: GRILL, kind: 'amenity', key: 'amenity-parrilla', name: 'Parrilla', position: 1 },
      { id: GAS, kind: 'service', key: 'service-gas', name: 'Gas natural', position: 0 },
    ].map((f) => ({ ...f, createdAt: at, updatedAt: at, createdBy: AUTHOR, updatedBy: AUTHOR })),
  );
}

function nextId(block: string): string {
  sequence += 1;
  return `00000000-0000-7000-${block}-${sequence.toString().padStart(12, '0')}`;
}

interface OperationSeed {
  readonly operation?: string;
  readonly priceCents?: bigint | null;
  readonly currency?: string;
  readonly priceOnRequest?: boolean;
}

async function insertProperty(
  overrides: Partial<typeof properties.$inferInsert> = {},
  operations: readonly OperationSeed[] = [{}],
) {
  const id = overrides.id ?? nextId('8000');
  const row = {
    id,
    code: `P-${sequence}`,
    slug: `propiedad-${sequence}`,
    title: `Propiedad ${sequence}`,
    // Columnas viejas (#33): NOT NULL hasta la migración contract; la búsqueda no las lee.
    operation: 'sale',
    currency: 'USD',
    propertyType: 'apartment',
    status: 'available',
    publishedOnWeb: true,
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    rooms: 2,
    createdAt: new Date(Date.UTC(2026, 0, sequence)),
    updatedAt: new Date(Date.UTC(2026, 0, sequence)),
    ...overrides,
  };
  await db.insert(properties).values(row);
  for (const operation of operations) {
    await db.insert(propertyOperations).values({
      id: nextId('8001'),
      propertyId: id,
      operation: operation.operation ?? 'rent',
      priceCents: operation.priceCents === undefined ? 60_000_000n : operation.priceCents,
      currency: operation.currency ?? 'ARS',
      priceOnRequest: operation.priceOnRequest ?? false,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
      createdBy: AUTHOR,
      updatedBy: AUTHOR,
    });
  }
  return row;
}

async function addFeatures(propertyId: string, featureIds: readonly string[]) {
  const [catalog] = await db.select({ id: features.id }).from(features).limit(1);
  if (!catalog) await insertCatalog();
  await db.insert(propertyFeatures).values(
    featureIds.map((featureId) => ({
      propertyId,
      featureId,
      createdAt: new Date(),
      createdBy: AUTHOR,
    })),
  );
}

async function addMedia(
  propertyId: string,
  overrides: Partial<typeof mediaItems.$inferInsert> = {},
) {
  const id = nextId('8003');
  await db.insert(mediaItems).values({
    id,
    propertyId,
    kind: 'photo',
    storageKey: `media/${id}`,
    url: `media/${id}`,
    variants: { web: `media/${id}/web` },
    uploadedBy: AUTHOR,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    createdBy: AUTHOR,
    updatedBy: AUTHOR,
    ...overrides,
  });
  return id;
}

async function insertLocation(name: string, parent?: { id: string; path: string }) {
  const id = nextId('8004');
  const path = `${parent?.path ?? '/'}${id}/`;
  await db.insert(locations).values({
    id,
    parentId: parent?.id,
    kind: parent ? 'neighborhood' : 'city',
    name,
    normalizedName: name.toLowerCase(),
    path,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: AUTHOR,
    updatedBy: AUTHOR,
  });
  return { id, path };
}

const listed: PropertySearchCriteria = {
  statuses: ['available'],
  publishedOnWebOnly: true,
  sort: 'featured',
  offset: 0,
  limit: 10,
};

async function titles(criteria: Partial<PropertySearchCriteria>) {
  const result = await query.search({ ...listed, ...criteria });
  return result.items.map((p) => p.title);
}

describe('DrizzlePropertySearchQuery', () => {
  it('returns only the requested statuses, published properties with operations', async () => {
    await insertProperty({ title: 'Disponible' });
    await insertProperty({ title: 'Reservada', status: 'reserved' });
    await insertProperty({ title: 'Oculta', publishedOnWeb: false });
    await insertProperty({ title: 'Sin operaciones' }, []);

    const result = await query.search(listed);

    expect(result.total).toBe(1);
    expect(result.items.map((p) => p.title)).toEqual(['Disponible']);
  });

  it('leaves out the properties in the trash', async () => {
    await insertProperty({ title: 'Activa' });
    const trashed = await insertProperty({
      title: 'Borrada',
      deletedAt: new Date('2026-09-30T12:00:00Z'),
      deletedBy: '00000000-0000-7000-8000-0000000000a1',
    });

    expect(await titles({})).toEqual(['Activa']);
    expect(await query.findById(trashed.id)).toBeUndefined();
    expect(await query.findBySlug(trashed.slug)).toBeUndefined();
  });

  it('matches the location by any word, ignoring accents and case', async () => {
    await insertProperty({ title: 'VL', neighborhood: 'Florida', city: 'Vicente López' });
    await insertProperty({ title: 'Palermo', neighborhood: 'Palermo' });

    expect(await titles({ location: 'vicente lopez' })).toEqual(['VL']);
    expect(await titles({ location: 'Palermo Soho' })).toEqual(['Palermo']);
  });

  it('matches a catalog location with its descendants', async () => {
    const caba = await insertLocation('CABA');
    const mataderos = await insertLocation('Mataderos', caba);
    const ramos = await insertLocation('Ramos Mejía');
    await insertProperty({ title: 'Mataderos', locationId: mataderos.id });
    await insertProperty({ title: 'Ramos', locationId: ramos.id });

    expect(await titles({ locationId: caba.id })).toEqual(['Mataderos']);
    expect(await titles({ locationId: mataderos.id })).toEqual(['Mataderos']);
  });

  it('filters by any of the operations, with the price of that operation', async () => {
    await insertProperty({ title: 'Alquiler barato' }, [{ priceCents: 40_000_000n }]);
    await insertProperty({ title: 'Alquiler caro' }, [{ priceCents: 90_000_000n }]);
    await insertProperty({ title: 'Venta y alquiler' }, [
      { operation: 'sale', priceCents: 15_000_000n, currency: 'USD' },
      { priceCents: 50_000_000n },
    ]);
    await insertProperty({ title: 'Venta' }, [
      { operation: 'sale', priceCents: 10_000_000n, currency: 'USD' },
    ]);

    expect(
      await titles({ operation: 'rent', currency: 'ARS', maxPriceCents: 70_000_000n }),
    ).toEqual(['Venta y alquiler', 'Alquiler barato']);
    expect(await titles({ operation: 'sale' })).toEqual(['Venta', 'Venta y alquiler']);
    expect(await titles({ currency: 'USD', minPriceCents: 12_000_000n })).toEqual([
      'Venta y alquiler',
    ]);
  });

  it('never matches a price filter with a hidden price', async () => {
    await insertProperty({ title: 'Visible' }, [{ priceCents: 50_000_000n }]);
    await insertProperty({ title: 'Oculto en la web', priceOnWeb: false }, [
      { priceCents: 50_000_000n },
    ]);
    await insertProperty({ title: 'A consultar' }, [
      { priceCents: 50_000_000n, priceOnRequest: true },
    ]);

    expect(await titles({ currency: 'ARS', maxPriceCents: 60_000_000n })).toEqual(['Visible']);
    expect(await titles({})).toHaveLength(3);
  });

  it('filters by type, rooms, bedrooms, bathrooms, surface, credit and featured', async () => {
    await insertProperty({
      title: 'Completa',
      rooms: 3,
      bedrooms: 2,
      bathrooms: 2,
      surfaceTotalM2: 80,
      creditEligible: true,
      featured: true,
    });
    await insertProperty({ title: 'Casa', propertyType: 'house', rooms: 3 });
    await insertProperty({ title: 'Mono', rooms: 1, surfaceCoveredM2: 30 });

    expect(
      await titles({
        propertyType: 'apartment',
        minRooms: 2,
        maxRooms: 3,
        minBedrooms: 2,
        minBathrooms: 2,
        minSurfaceM2: 50,
        creditEligible: true,
        featuredOnly: true,
      }),
    ).toEqual(['Completa']);
    expect(await titles({ minSurfaceM2: 25, maxRooms: 1 })).toEqual(['Mono']);
  });

  it('requires every feature, by id or by partial accent-insensitive name', async () => {
    const both = await insertProperty({ title: 'Pileta y parrilla' });
    const pool = await insertProperty({ title: 'Solo pileta' });
    await addFeatures(both.id, [POOL, GRILL]);
    await addFeatures(pool.id, [POOL]);

    expect(await titles({ featureIds: [POOL, GRILL] })).toEqual(['Pileta y parrilla']);
    expect(await titles({ amenities: ['pileta climatizada'] })).toEqual([
      'Solo pileta',
      'Pileta y parrilla',
    ]);
    expect(await titles({ amenities: ['PARRI'] })).toEqual(['Pileta y parrilla']);
  });

  it('leaves out the excluded property (similar properties)', async () => {
    const current = await insertProperty({ title: 'Actual' });
    await insertProperty({ title: 'Otra' });

    expect(await titles({ excludePropertyId: current.id })).toEqual(['Otra']);
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
    expect(await titles({ sort: 'newest' })).toEqual(['Destacada', 'Nueva', 'Vieja']);
  });

  it('sorts by the visible price of the searched operation, hidden prices last', async () => {
    await insertProperty({ title: 'Media' }, [{ priceCents: 50_000_000n }]);
    await insertProperty({ title: 'Oculta', priceOnWeb: false }, [{ priceCents: 1n }]);
    await insertProperty({ title: 'Barata' }, [
      { operation: 'sale', priceCents: 99_000_000n, currency: 'USD' },
      { priceCents: 30_000_000n },
    ]);
    await insertProperty({ title: 'Cara' }, [{ priceCents: 90_000_000n }]);

    expect(await titles({ operation: 'rent', sort: 'price_asc' })).toEqual([
      'Barata',
      'Media',
      'Cara',
      'Oculta',
    ]);
    expect(await titles({ operation: 'rent', sort: 'price_desc' })).toEqual([
      'Cara',
      'Media',
      'Barata',
      'Oculta',
    ]);
  });

  it('sorts by surface, total or covered, unknown last', async () => {
    await insertProperty({ title: 'Chica', surfaceTotalM2: 40 });
    await insertProperty({ title: 'Sin superficie' });
    await insertProperty({ title: 'Grande', surfaceCoveredM2: 120 });

    expect(await titles({ sort: 'surface_desc' })).toEqual(['Grande', 'Chica', 'Sin superficie']);
  });

  it('maps a full record by id and by slug, with operations, features and media', async () => {
    const row = await insertProperty(
      {
        expensesCents: 9_500_000n,
        surfaceTotalM2: 48.5,
        priceOnWeb: false,
        publishAddress: 'Gurruchaga al 1800',
        latitude: -34.588123,
        longitude: -58.430987,
      },
      [
        { priceCents: 50_000_000n },
        { operation: 'sale', priceCents: 15_000_000n, currency: 'USD', priceOnRequest: true },
      ],
    );
    await addFeatures(row.id, [POOL, GAS]);
    const second = await addMedia(row.id, { position: 1 });
    const cover = await addMedia(row.id, { position: 2, isCover: true });
    const video = await addMedia(row.id, {
      kind: 'video',
      storageKey: null,
      url: 'https://youtu.be/abc',
      variants: {},
      position: 3,
    });

    const record = await query.findById(row.id);

    expect(record).toMatchObject({
      id: row.id,
      showPriceOnWeb: false,
      expensesCents: 9_500_000n,
      surfaceTotalM2: 48.5,
      publishAddress: 'Gurruchaga al 1800',
      latitude: -34.588123,
      operations: [
        { operation: 'sale', priceCents: 15_000_000n, currency: 'USD', priceOnRequest: true },
        { operation: 'rent', priceCents: 50_000_000n, currency: 'ARS', priceOnRequest: false },
      ],
      features: [
        { kind: 'service', name: 'Gas natural' },
        { kind: 'amenity', name: 'Pileta' },
      ],
    });
    expect(record?.media.map((m) => m.id)).toEqual([cover, second, video]);
    expect(record?.media[0]).toMatchObject({
      externalUrl: null,
      processing: 'ready',
      variants: { web: `media/${cover}/web` },
    });
    expect(record?.media[2]).toMatchObject({ kind: 'video', externalUrl: 'https://youtu.be/abc' });
    expect((await query.findBySlug(row.slug))?.id).toBe(row.id);
    expect(await query.findById('00000000-0000-7000-8000-999999999999')).toBeUndefined();
  });

  it('finds the property that owns a photo, outside the trash', async () => {
    const row = await insertProperty();
    const photo = await addMedia(row.id);
    const trashed = await insertProperty({ deletedAt: new Date('2026-10-02T12:00:00Z') });
    const trashedPhoto = await addMedia(trashed.id);

    expect((await query.findByMediaId(photo))?.id).toBe(row.id);
    expect(await query.findByMediaId(trashedPhoto)).toBeUndefined();
    expect(await query.findByMediaId('00000000-0000-7000-8003-999999999999')).toBeUndefined();
  });
});
