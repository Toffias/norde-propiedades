import {
  Development,
  DevelopmentUnitImport,
  normalizeUnitDesignation,
  Property,
  type DevelopmentId,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import { importJobs, locations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzleDevelopmentRepository } from './drizzle-development-repository';
import {
  DrizzleDevelopmentUnitImportQuery,
  DrizzleDevelopmentUnitImportRepository,
} from './drizzle-development-unit-imports';
import { DrizzlePropertyRepository } from './drizzle-property-repository';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const developmentRepository = new DrizzleDevelopmentRepository(db);
const properties = new DrizzlePropertyRepository(db, ids);
const imports = new DrizzleDevelopmentUnitImportRepository(db, ids);
const query = new DrizzleDevelopmentUnitImportQuery(db);

const PRODUCER = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-10-03T12:00:00Z');

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

async function aDevelopment(code: string): Promise<DevelopmentId> {
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
  await developmentRepository.save(development, PRODUCER);
  return development.id;
}

async function aUnit(
  code: string,
  developmentId: string,
  floor: string | undefined,
  unit: string,
  deleted = false,
) {
  const property = unwrap(
    Property.create({
      id: unwrap(parseId<'Property'>(ids.next())),
      code,
      kind: 'apartment',
      operation: { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
      address: {
        street: 'Gurruchaga 1834',
        streetNumber: undefined,
        floor,
        unit,
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'CABA',
      },
      publishAddress: undefined,
      portalTitle: undefined,
      coordinates: undefined,
      locationId: undefined,
      developmentId,
      producerUserId: PRODUCER,
      branchId: BRANCH,
      now: NOW,
    }),
  );
  if (deleted) unwrap(property.delete(PRODUCER, NOW));
  await properties.save(property, PRODUCER);
  return property;
}

function anImport(developmentId: string, createdAt: Date) {
  const id = unwrap(parseId<'DevelopmentUnitImport'>(ids.next()));
  return unwrap(
    DevelopmentUnitImport.request({
      id,
      developmentId,
      fileName: 'unidades.xlsx',
      storageKey: `imports/development-units/${id}`,
      mapping: { floor: 0, unit: 1, salePrice: 2 },
      columnCount: 3,
      rows: 4,
      canMarkAvailable: true,
      requestedBy: PRODUCER,
      now: createdAt,
    }),
  );
}

describe('DrizzlePropertyRepository.findUnitsByDesignation', () => {
  it('finds the unit by its floor and unit, normalized as the domain does', async () => {
    const development = await aDevelopment('EMP0001');
    const other = await aDevelopment('EMP0002');
    const unit = await aUnit('DEP0001', development, '4°', 'a');
    await aUnit('DEP0002', other, '4', 'A');
    await aUnit('DEP0003', development, '4', 'B');

    const found = await properties.findUnitsByDesignation(
      development,
      { floor: normalizeUnitDesignation('4'), unit: normalizeUnitDesignation('A') },
      2,
    );

    expect(found.map((p) => p.id)).toEqual([unit.id]);
  });

  it.each([
    ['P.B.', 'Lote 12'],
    ['1º', 'Ñ'],
    [undefined, 'Cochera 3'],
    ['  10 ', 'b'],
  ])('matches the domain normalization for %s / %s', async (floor, unitName) => {
    const development = await aDevelopment('EMP0003');
    const unit = await aUnit('DEP0004', development, floor, unitName);

    const found = await properties.findUnitsByDesignation(
      development,
      { floor: normalizeUnitDesignation(floor), unit: normalizeUnitDesignation(unitName) },
      2,
    );

    expect(found.map((p) => p.id)).toEqual([unit.id]);
  });

  it('returns the active units before the ones in the trash', async () => {
    const development = await aDevelopment('EMP0004');
    await aUnit('DEP0005', development, '5', 'C', true);
    const active = await aUnit('DEP0006', development, '5', 'C');

    const found = await properties.findUnitsByDesignation(
      development,
      { floor: '5', unit: 'C' },
      2,
    );

    expect(found.map((p) => [p.id, p.isDeleted])).toEqual([
      [active.id, false],
      [expect.any(String), true],
    ]);
  });
});

describe('DrizzleDevelopmentUnitImportRepository', () => {
  it('saves and restores an import with its progress and problems', async () => {
    const development = await aDevelopment('EMP0005');
    const job = anImport(development, NOW);
    await imports.save(job, PRODUCER);
    unwrap(job.start(NOW));
    job.recordRow('created', NOW);
    job.recordRow('failed', NOW);
    await imports.save(job, 'system:import');
    await imports.addProblem(
      job.id,
      { rowNumber: 3, code: 'missing_type', field: 'propertyType', propertyId: undefined },
      NOW,
    );

    const restored = await imports.findById(job.id);
    expect(restored?.toSnapshot()).toEqual(job.toSnapshot());
    const problems = await query.problems({
      importId: job.id,
      direction: 'asc',
      offset: 0,
      limit: 10,
    });
    expect(problems).toEqual({
      items: [{ rowNumber: 3, code: 'missing_type', field: 'propertyType', propertyId: undefined }],
      total: 1,
    });
    expect(await query.find(job.id)).toMatchObject({
      developmentId: development,
      status: 'running',
    });
  });
});

describe('DrizzleDevelopmentUnitImportQuery.list', () => {
  it('pages the imports of one development, newest first', async () => {
    const development = await aDevelopment('EMP0006');
    const other = await aDevelopment('EMP0007');
    const jobs = [0, 1, 2].map((day) =>
      anImport(development, new Date(NOW.getTime() + day * 86_400_000)),
    );
    for (const job of [...jobs, anImport(other, NOW)]) await imports.save(job, PRODUCER);

    const first = await query.list({
      developmentId: development,
      direction: 'desc',
      offset: 0,
      limit: 2,
    });
    const second = await query.list({
      developmentId: development,
      direction: 'desc',
      offset: 2,
      limit: 2,
    });

    expect(first.total).toBe(3);
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(
      [...jobs].reverse().map((job) => job.id),
    );
  });

  it('uses the index of the development imports', async () => {
    const development = await aDevelopment('EMP0008');
    // Otras corridas, para que el plan no dependa de una tabla vacía.
    await db.insert(importJobs).values(
      Array.from({ length: 50 }, (_, n) => ({
        id: ids.next(),
        kind: n % 2 === 0 ? 'clients_xlsx' : 'units_xlsx',
        status: 'done',
        options: { developmentId: ids.next(), mapping: {} },
        createdAt: NOW,
        updatedAt: NOW,
        createdBy: PRODUCER,
        updatedBy: PRODUCER,
      })),
    );

    const captured: { sql: string; params: unknown[] }[] = [];
    const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
    try {
      const logged = drizzle(pool, {
        schema,
        logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
      });
      await new DrizzleDevelopmentUnitImportQuery(logged).list({
        developmentId: development,
        direction: 'desc',
        offset: 0,
        limit: 25,
      });
      const page = captured.find((q) => /\blimit\b/i.test(q.sql));
      if (!page) throw new Error('No page query captured');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local enable_seqscan = off');
        const result = await client.query<{ 'QUERY PLAN': unknown }>(
          `explain (format json) ${page.sql}`,
          page.params,
        );
        await client.query('rollback');
        const plan = JSON.stringify(result.rows[0]?.['QUERY PLAN']);
        expect(plan).toContain('import_jobs_units_development_idx');
        expect(plan).not.toContain('Seq Scan');
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  });
});
