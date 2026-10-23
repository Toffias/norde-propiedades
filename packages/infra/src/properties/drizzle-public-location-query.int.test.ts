import type { PublicLocationCriteria } from '@norde/core/properties';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { locations, properties, propertyOperations } from '../db/schema';

import { DrizzlePublicLocationQuery } from './drizzle-public-location-query';

const db = useTestDatabase();
const query = new DrizzlePublicLocationQuery(db);
let sequence = 0;

const AUTHOR = 'system:import';
const AT = new Date('2026-10-01T12:00:00Z');

function nextId(block: string): string {
  sequence += 1;
  return `00000000-0000-7000-${block}-${sequence.toString().padStart(12, '0')}`;
}

async function insertLocation(
  name: string,
  kind: string,
  normalizedName: string,
  parent?: { id: string; path: string },
) {
  const id = nextId('8004');
  const path = `${parent?.path ?? '/'}${id}/`;
  await db.insert(locations).values({
    id,
    parentId: parent?.id,
    kind,
    name,
    normalizedName,
    path,
    createdAt: AT,
    updatedAt: AT,
    createdBy: AUTHOR,
    updatedBy: AUTHOR,
  });
  return { id, path };
}

async function insertProperty(
  locationId: string,
  overrides: Partial<typeof properties.$inferInsert> = {},
  withOperation = true,
) {
  const id = nextId('8000');
  await db.insert(properties).values({
    id,
    code: `P-${sequence}`,
    slug: `propiedad-${sequence}`,
    title: `Propiedad ${sequence}`,
    // Columnas viejas (#33): NOT NULL hasta la migración contract.
    operation: 'sale',
    currency: 'USD',
    propertyType: 'apartment',
    status: 'available',
    publishedOnWeb: true,
    neighborhood: '',
    city: '',
    province: '',
    locationId,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  });
  if (withOperation) {
    await db.insert(propertyOperations).values({
      id: nextId('8001'),
      propertyId: id,
      operation: 'sale',
      priceCents: 10_000_000n,
      currency: 'USD',
      priceOnRequest: false,
      createdAt: AT,
      updatedAt: AT,
      createdBy: AUTHOR,
      updatedBy: AUTHOR,
    });
  }
}

const listed: PublicLocationCriteria = { statuses: ['available'], offset: 0, limit: 10 };

/** Argentina › CABA › CABA › Palermo › Palermo Soho, y Buenos Aires › Ramos Mejía y Palomar. */
async function insertTree() {
  const argentina = await insertLocation('Argentina', 'country', 'argentina');
  const cabaProvince = await insertLocation('CABA', 'province', 'caba', argentina);
  const caba = await insertLocation('CABA', 'city', 'caba', cabaProvince);
  const palermo = await insertLocation('Palermo', 'neighborhood', 'palermo', caba);
  const soho = await insertLocation('Palermo Soho', 'subneighborhood', 'palermo soho', palermo);
  const almagro = await insertLocation('Almagro', 'neighborhood', 'almagro', caba);
  const buenosAires = await insertLocation('Buenos Aires', 'province', 'buenos aires', argentina);
  const ramos = await insertLocation('Ramos Mejía', 'city', 'ramos mejia', buenosAires);
  const palomar = await insertLocation('El Palomar', 'city', 'el palomar', buenosAires);
  return { argentina, caba, palermo, soho, almagro, ramos, palomar };
}

describe('DrizzlePublicLocationQuery', () => {
  it('counts the listed properties of each location and its descendants, without countries', async () => {
    const tree = await insertTree();
    await insertProperty(tree.palermo.id);
    await insertProperty(tree.soho.id);
    await insertProperty(tree.ramos.id);
    // No cuentan: reservada, sin publicar, en la papelera y sin operaciones.
    await insertProperty(tree.almagro.id, { status: 'reserved' });
    await insertProperty(tree.almagro.id, { publishedOnWeb: false });
    await insertProperty(tree.almagro.id, { deletedAt: AT });
    await insertProperty(tree.almagro.id, {}, false);

    const result = await query.search(listed);
    const counts = Object.fromEntries(result.items.map((l) => [l.name, l.listingCount]));

    // La ciudad "CABA" no se repite: la provincia "CABA" ya la incluye.
    expect(result.total).toBe(5);
    expect(result.items.filter((l) => l.name === 'CABA')).toHaveLength(1);
    expect(counts).toEqual({
      CABA: 2,
      Palermo: 2,
      'Palermo Soho': 1,
      'Buenos Aires': 1,
      'Ramos Mejía': 1,
    });
  });

  it('matches the name without accents and ranks exact, prefix, word and then the rest', async () => {
    const tree = await insertTree();
    await insertProperty(tree.soho.id);
    await insertProperty(tree.palermo.id);
    await insertProperty(tree.palomar.id);
    await insertProperty(tree.ramos.id);

    const palermo = await query.search({ ...listed, text: 'PALERMO' });
    const pal = await query.search({ ...listed, text: 'pal' });
    const mejia = await query.search({ ...listed, text: 'Mejía' });

    expect(palermo.items.map((l) => l.name)).toEqual(['Palermo', 'Palermo Soho']);
    // "Palermo" tiene más propiedades que "Palermo Soho"; "El Palomar" empieza otra palabra.
    expect(pal.items.map((l) => l.name)).toEqual(['Palermo', 'Palermo Soho', 'El Palomar']);
    expect(mejia.items.map((l) => l.name)).toEqual(['Ramos Mejía']);
  });

  it('returns the ancestors and finds locations by id, paginating with the total', async () => {
    const tree = await insertTree();
    await insertProperty(tree.soho.id);
    await insertProperty(tree.ramos.id);

    const [soho] = (await query.search({ ...listed, ids: [tree.soho.id] })).items;
    const page = await query.search({ ...listed, limit: 2, offset: 2 });

    expect(soho).toMatchObject({
      kind: 'subneighborhood',
      ancestors: ['Argentina', 'CABA', 'CABA', 'Palermo'],
      listingCount: 1,
    });
    expect(page.total).toBe(5);
    expect(page.items).toHaveLength(2);
  });

  it('treats like wildcards in the text literally', async () => {
    const tree = await insertTree();
    await insertProperty(tree.palermo.id);

    expect((await query.search({ ...listed, text: '%' })).items).toEqual([]);
    expect((await query.search({ ...listed, text: 'p_lermo' })).items).toEqual([]);
  });
});
