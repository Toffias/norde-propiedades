import { readFileSync } from 'node:fs';
import path from 'node:path';

import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { auditLog, locations, properties } from '../db/schema';

const db = useTestDatabase();
let sequence = 0;

const AUTHOR = 'system:import';
const AT = new Date('2026-10-01T12:00:00Z');

function nextId(block: string): string {
  sequence += 1;
  return `00000000-0000-7000-${block}-${sequence.toString().padStart(12, '0')}`;
}

async function insertLocation(name: string, kind: string, parent?: { id: string; path: string }) {
  const id = nextId('8004');
  const locationPath = `${parent?.path ?? '/'}${id}/`;
  await db.insert(locations).values({
    id,
    parentId: parent?.id,
    kind,
    name,
    normalizedName: sql`core.search_normalize(${name})`,
    path: locationPath,
    createdAt: AT,
    updatedAt: AT,
    createdBy: AUTHOR,
    updatedBy: AUTHOR,
  });
  return { id, path: locationPath };
}

async function insertProperty(
  place: { neighborhood: string; city: string; province: string },
  locationId?: string,
) {
  const id = nextId('8000');
  await db.insert(properties).values({
    id,
    code: `P-${sequence}`,
    slug: `propiedad-${sequence}`,
    title: `Propiedad ${sequence}`,
    propertyType: 'apartment',
    status: 'available',
    ...place,
    locationId,
    createdAt: AT,
    updatedAt: AT,
  });
  return id;
}

async function locationOf(propertyId: string) {
  const [row] = await db
    .select({ locationId: properties.locationId })
    .from(properties)
    .where(eq(properties.id, propertyId));
  return row?.locationId;
}

/** Corre la migración como drizzle-kit: en una sola conexión (usa una tabla temporal). */
async function runMigration() {
  const migration = readFileSync(
    path.resolve(import.meta.dirname, '../db/migrations/0041_location_backfill.sql'),
    'utf8',
  );
  await db.transaction(async (tx) => {
    for (const statement of migration.split('--> statement-breakpoint')) {
      await tx.execute(sql.raw(statement));
    }
  });
}

describe('0041 location backfill', () => {
  it('links properties to the only catalog location matching their texts, audited', async () => {
    const argentina = await insertLocation('Argentina', 'country');
    const cabaProvince = await insertLocation('CABA', 'province', argentina);
    const caba = await insertLocation('CABA', 'city', cabaProvince);
    const mataderos = await insertLocation('Mataderos', 'neighborhood', caba);
    const buenosAires = await insertLocation('Buenos Aires', 'province', argentina);
    const ramos = await insertLocation('Ramos Mejía', 'city', buenosAires);
    const moron = await insertLocation('Morón', 'city', buenosAires);
    // "Centro" existe en dos localidades: sin la localidad, es ambiguo.
    await insertLocation('Centro', 'neighborhood', ramos);
    const moronCentro = await insertLocation('Centro', 'neighborhood', moron);
    const linked = await insertLocation('Liniers', 'neighborhood', caba);

    const byNeighborhood = await insertProperty({
      neighborhood: ' MATADEROS ',
      city: 'caba',
      province: 'CABA',
    });
    const byCity = await insertProperty({
      neighborhood: 'Barrio sin catálogo',
      city: 'ramos mejia',
      province: 'Buenos Aires',
    });
    const inCity = await insertProperty({ neighborhood: 'Centro', city: 'Morón', province: '' });
    const ambiguous = await insertProperty({ neighborhood: 'Centro', city: '', province: '' });
    const wrongCity = await insertProperty({
      neighborhood: 'Mataderos',
      city: 'Morón',
      province: 'Córdoba',
    });
    const alreadyLinked = await insertProperty(
      { neighborhood: 'Mataderos', city: 'CABA', province: 'CABA' },
      linked.id,
    );

    await runMigration();
    await runMigration();

    expect(await locationOf(byNeighborhood)).toBe(mataderos.id);
    expect(await locationOf(byCity)).toBe(ramos.id);
    expect(await locationOf(inCity)).toBe(moronCentro.id);
    expect(await locationOf(ambiguous)).toBeNull();
    expect(await locationOf(wrongCity)).toBeNull();
    expect(await locationOf(alreadyLinked)).toBe(linked.id);

    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, byNeighborhood));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: 'system:import',
      action: 'property.updated',
      entityType: 'property',
      changes: { locationId: { before: null, after: mataderos.id } },
    });
    // Tres vinculadas, auditadas una sola vez aunque la migración corra dos veces.
    expect(await db.select().from(auditLog)).toHaveLength(3);
  });
});
