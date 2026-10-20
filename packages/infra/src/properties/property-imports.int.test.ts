import {
  Location,
  RunPropertyImport,
  StartPropertyImport,
  type PropertyImportDirectory,
} from '@norde/core/properties';
import { Actor, parseId, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { UploadedSpreadsheetReader } from '../adapters/imports/uploaded-spreadsheet-reader';
import { LocalFileStorage } from '../adapters/storage/local-file-storage';
import { auditLog, locations, properties, propertyOperations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzlePropertyImportQuery } from './drizzle-property-imports';
import { createPropertiesUnitOfWork } from './properties-unit-of-work';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const clock = new FixedClock('2026-10-20T12:00:00Z');
const uow = createPropertiesUnitOfWork(db, { ids, clock });
const query = new DrizzlePropertyImportQuery(db);

const ADMIN = '00000000-0000-7000-8000-0000000000a9';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const admin = Actor.user(ADMIN, ['properties:import']).withBranch(BRANCH);
const importJob = Actor.system('import', ['properties:run-imports']);

/** Sin productores, emprendimientos ni propietarios: lo prueba el core. */
const directory: PropertyImportDirectory = {
  searchProducers: () => Promise.resolve([]),
  searchDevelopments: () => Promise.resolve([]),
  findOrCreateOwner: () => Promise.resolve(undefined),
};

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** Argentina > Buenos Aires > La Matanza, como el catálogo sembrado. */
async function seedCatalog(): Promise<string> {
  let parent: Location | undefined;
  for (const name of ['Argentina', 'Buenos Aires', 'La Matanza']) {
    const s = parent?.toSnapshot();
    const location = unwrap(
      Location.create({
        id: unwrap(parseId<'Location'>(ids.next())),
        name,
        parent: s && { id: s.id, kind: s.kind, path: s.path },
        now: clock.now(),
      }),
    );
    await uow.run((tx) => tx.locations.save(location, ADMIN));
    parent = location;
  }
  return parent?.id ?? '';
}

const CSV = [
  'Ref,País,Región,Barrio,Dirección,Tipo de propiedad,Productor,Total construido,Cubierta,Ambientes,Expensas,Venta,Alquiler,Propietario,Celular,Emprendimiento',
  'NPH9001,Argentina,G.B.A. Zona Oeste,Ramos Mejia,"Belgrano 123, PB",PH,Libre,80.00 m2,70.00 m2,3,15000,USD 99.000,$ 500.000,Ana Prueba,,',
  'NPH9002,Argentina,G.B.A. Zona Oeste,Ramos Mejia,Belgrano 125,PH,Libre,0.00 m2,0.00 m2,2,0,USD 80.000,-,,,',
].join('\n');

describe('Tokko property imports', () => {
  it('imports the Tokko CSV through the job, idempotent by code, with the catalog place', async () => {
    const laMatanza = await seedCatalog();
    const storage = new LocalFileStorage(await mkdtemp(join(tmpdir(), 'norde-import-')));
    const reader = new UploadedSpreadsheetReader();
    const start = new StartPropertyImport({ uow, reader, storage, ids, clock });
    const run = new RunPropertyImport({
      uow,
      reader,
      storage,
      directory,
      producers: { find: () => Promise.resolve({ branchId: BRANCH }) },
      ids,
      clock,
    });
    const bytes = new TextEncoder().encode(CSV);

    const importOnce = async () => {
      const { importId } = unwrap(
        await start.execute({ fileName: 'Propiedades.csv', bytes }, admin),
      );
      unwrap(await run.execute({ importId }, importJob));
      return importId;
    };
    const first = await importOnce();
    const second = await importOnce();

    expect((await query.find(first))?.totals).toMatchObject({ created: 2, existing: 0, failed: 0 });
    expect((await query.find(second))?.totals).toMatchObject({ created: 0, existing: 2 });
    const page = await query.list({ direction: 'desc', offset: 0, limit: 10 });
    expect(page.items.map((item) => item.id)).toEqual([second, first]);
    const problems = await query.problems({
      importId: first,
      direction: 'asc',
      offset: 0,
      limit: 10,
    });
    // El propietario sin teléfono ni email queda como aviso.
    expect(problems.items).toMatchObject([
      { rowNumber: 2, code: 'owner_not_linked', field: 'ownerPhone' },
    ]);

    const [ph] = await db
      .select({
        id: properties.id,
        status: properties.status,
        locationId: properties.locationId,
        floor: properties.floor,
        producerUserId: properties.producerUserId,
      })
      .from(properties)
      .where(eq(properties.code, 'NPH9001'));
    const ramos = await db
      .select({ id: locations.id, parentId: locations.parentId })
      .from(locations)
      .where(eq(locations.name, 'Ramos Mejia'));
    expect(ramos).toEqual([{ id: ph?.locationId, parentId: laMatanza }]);
    expect(ph).toMatchObject({ status: 'available', floor: 'PB', producerUserId: ADMIN });
    const operations = await db
      .select({ operation: propertyOperations.operation, currency: propertyOperations.currency })
      .from(propertyOperations)
      .where(eq(propertyOperations.propertyId, ph?.id ?? ''));
    expect(operations.map((o) => `${o.operation}:${o.currency}`).sort()).toEqual([
      'rent:ARS',
      'sale:USD',
    ]);
    const created = await db
      .select({ actorId: auditLog.actorId, correlationId: auditLog.correlationId })
      .from(auditLog)
      .where(eq(auditLog.action, 'property.imported'));
    expect(created).toHaveLength(2);
    expect(created.every((e) => e.actorId === 'system:import' && e.correlationId === first)).toBe(
      true,
    );
    expect(await storage.get(`imports/properties/${first}`)).toBeUndefined();
  });
});
