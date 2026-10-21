import {
  Location,
  RunPropertyImport,
  RunTokkoApiPropertyImport,
  StartPropertyImport,
  StartTokkoApiPropertyImport,
  type PropertyImportDirectory,
  type TokkoApiDevelopment,
  type TokkoApiProperty,
} from '@norde/core/properties';
import { FakeTokkoPropertySource } from '@norde/core/properties/testing';
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
import {
  auditLog,
  developments,
  locations,
  mediaItems,
  properties,
  propertyOperations,
} from '../db/schema';
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

  it('brings the properties from the Tokko API one at a time, with their photos', async () => {
    await seedCatalog();
    const storage = new LocalFileStorage(await mkdtemp(join(tmpdir(), 'norde-import-')));
    const photo = 'https://static.tokkobroker.com/pictures/1.jpg';
    const tokko: TokkoApiProperty = {
      referenceCode: 'NPH9101',
      typeName: 'PH',
      address: 'Belgrano 123',
      floor: 'PB',
      unit: undefined,
      fullLocation: 'Argentina | G.B.A. Zona Oeste | La Matanza | Ramos Mejia',
      producerName: undefined,
      operations: [{ operationId: 1, prices: [{ currency: 'USD', amount: 99_000 }] }],
      showPrice: true,
      surfaceTotal: undefined,
      surfaceLand: undefined,
      surfaceCovered: undefined,
      surfaceSemiCovered: undefined,
      surfaceUncovered: undefined,
      front: undefined,
      depth: undefined,
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      toilets: undefined,
      parkingSpaces: undefined,
      age: undefined,
      expenses: undefined,
      floors: undefined,
      zoning: undefined,
      title: 'PH en Ramos Mejía',
      description: 'Un PH luminoso.',
      internalComments: undefined,
      latitude: -34.64,
      longitude: -58.56,
      owners: [],
      developmentCode: 'NBU9100',
      developmentName: 'Torre Belgrano',
      photos: [{ url: photo, fallbackUrl: undefined, order: 0, isCover: true, isFloorPlan: false }],
    };
    const development: TokkoApiDevelopment = {
      referenceCode: 'NBU9100',
      name: 'Torre Belgrano + EN POZO',
      typeCode: 'BU',
      address: 'Belgrano 123',
      fullLocation: 'Argentina | G.B.A. Zona Oeste | La Matanza | Ramos Mejia',
      constructionStatus: 3,
      constructionDate: '2028-12-01',
      displayOnWeb: true,
      title: undefined,
      description: 'Un edificio nuevo.',
      financingDetails: undefined,
      latitude: undefined,
      longitude: undefined,
      producerName: undefined,
      photos: [],
    };
    const source = new FakeTokkoPropertySource(
      [tokko, { ...tokko, referenceCode: 'NPH 9102', typeName: 'Castillo', photos: [] }],
      new Map([[photo, { bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' }]]),
      [development],
    );
    const start = new StartTokkoApiPropertyImport({ uow, configured: true, ids, clock });
    const run = new RunTokkoApiPropertyImport({
      uow,
      source,
      storage,
      directory,
      producers: { find: () => Promise.resolve({ branchId: BRANCH }) },
      ids,
      clock,
    });

    const { importId } = unwrap(await start.execute({}, admin));
    // Una sola a la vez: la pendiente bloquea otra.
    expect(await uow.run((tx) => tx.propertyImports.hasActiveApiImport())).toBe(true);
    unwrap(await run.execute({ importId }, importJob));
    expect(await uow.run((tx) => tx.propertyImports.hasActiveApiImport())).toBe(false);

    const job = await query.find(importId);
    expect(job).toMatchObject({
      source: 'api',
      fileName: '',
      status: 'done',
      totals: {
        rows: 2,
        processed: 2,
        created: 1,
        completed: 0,
        failed: 1,
        developments: { created: 1, existing: 0, completed: 0, failed: 0 },
      },
    });
    const problems = await query.problems({ importId, direction: 'asc', offset: 0, limit: 10 });
    expect(problems.items).toEqual([
      {
        rowNumber: 2,
        code: 'unknown_type',
        field: 'propertyType',
        propertyId: undefined,
        reference: 'NPH-9102',
        subject: 'property',
      },
    ]);
    const [ph] = await db
      .select({
        id: properties.id,
        description: properties.description,
        developmentId: properties.developmentId,
      })
      .from(properties)
      .where(eq(properties.code, 'NPH9101'));
    expect(ph?.description).toBe('Un PH luminoso.');
    // El emprendimiento se creó antes y la unidad quedó vinculada en la misma corrida.
    const [torre] = await db
      .select({
        id: developments.id,
        name: developments.name,
        status: developments.status,
        constructionStatus: developments.constructionStatus,
      })
      .from(developments)
      .where(eq(developments.code, 'NBU9100'));
    expect(torre).toMatchObject({
      name: 'Torre Belgrano',
      status: 'marketing',
      constructionStatus: 'pre_sale',
    });
    expect(ph?.developmentId).toBe(torre?.id);
    // Sin propietarios en Tokko, la propiedad no tiene ninguno (al completarla se buscarían).
    const phId = ph?.id ?? '';
    expect(await uow.run((tx) => tx.owners.hasAny(phId))).toBe(false);
    const gallery = await db
      .select({ kind: mediaItems.kind, isCover: mediaItems.isCover })
      .from(mediaItems)
      .where(eq(mediaItems.propertyId, ph?.id ?? ''));
    expect(gallery).toEqual([{ kind: 'photo', isCover: true }]);
  });
});
