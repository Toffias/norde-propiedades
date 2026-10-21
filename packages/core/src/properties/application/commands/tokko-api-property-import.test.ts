import { describe, expect, it } from 'vitest';

import { InMemoryFileStorage } from '../../../settings/testing';
import { Actor, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { Coordinates } from '../../domain/coordinates';
import type { LocationKind, LocationSnapshot } from '../../domain/location';
import { EMPTY_INTERNAL_INFO } from '../../domain/property-details';
import {
  BRANCH_ID,
  FakePropertyImportDirectory,
  FakeTokkoPropertySource,
  InMemoryProducers,
  InMemoryPropertiesUnitOfWork,
  InMemoryPropertyImportQuery,
  InMemoryUserNames,
  PRODUCER_ID,
  propertySnapshot,
  TEST_NOW,
} from '../../testing';
import type { TokkoApiProperty } from '../ports/tokko-property-source';
import { RunTokkoApiPropertyImport } from '../handlers/run-tokko-api-property-import';
import { ListPropertyImportProblems } from '../queries/list-property-import-problems';
import { ListPropertyImports } from '../queries/list-property-imports';

import { StartTokkoApiPropertyImport } from './start-tokko-api-property-import';

// Propiedades con la forma de la API de Tokko (`/api/v1/property/`), con datos inventados.

const ADMIN_ID = '00000000-0000-7000-8000-0000000000a9';
const ADMIN = Actor.user(ADMIN_ID, ['properties:read', 'properties:import']).withBranch(BRANCH_ID);
const JOB_ACTOR = Actor.system('import', ['properties:run-imports']);

const JPEG = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), contentType: 'image/jpeg' };
const photoUrl = (code: string, n: number) =>
  `https://static.tokkobroker.com/pictures/${code}-${String(n)}.jpg`;

function apiProperty(overrides: Partial<TokkoApiProperty> = {}): TokkoApiProperty {
  return {
    referenceCode: 'NHO1001',
    typeName: 'Casa',
    address: 'Calle Falsa 123',
    floor: undefined,
    unit: undefined,
    fullLocation: 'Argentina | Capital Federal | Villa Luro ',
    producerName: 'Micaela Santo',
    operations: [
      { operationId: 1, prices: [{ currency: 'USD', amount: 150_000 }] },
      { operationId: 2, prices: [{ currency: 'ARS', amount: 700_000 }] },
    ],
    showPrice: true,
    surfaceTotal: '120.00',
    surfaceLand: '0.00',
    surfaceCovered: '100.00',
    surfaceSemiCovered: '10.00',
    surfaceUncovered: '10.00',
    front: undefined,
    depth: undefined,
    rooms: 4,
    bedrooms: 3,
    bathrooms: 2,
    toilets: 0,
    parkingSpaces: 1,
    age: -1,
    expenses: 0,
    floors: 2,
    zoning: undefined,
    title: 'Casa con jardín en Villa Luro',
    description: 'Hermosa casa de 4 ambientes.',
    internalComments: 'Llaves en la oficina.',
    latitude: -34.6385,
    longitude: -58.5021,
    owners: [
      { name: 'Ana Prueba', phone: '5491100000001', email: undefined },
      { name: 'Beto Prueba', phone: undefined, email: 'beto@example.test' },
    ],
    developmentCode: undefined,
    developmentName: undefined,
    photos: [
      {
        url: photoUrl('NHO1001', 2),
        fallbackUrl: undefined,
        order: 1,
        isCover: false,
        isFloorPlan: false,
      },
      {
        url: photoUrl('NHO1001', 1),
        fallbackUrl: undefined,
        order: 0,
        isCover: true,
        isFloorPlan: false,
      },
      {
        url: photoUrl('NHO1001', 3),
        fallbackUrl: undefined,
        order: 2,
        isCover: false,
        isFloorPlan: true,
      },
    ],
    ...overrides,
  };
}

function id<T extends string>(n: number) {
  return unwrap(parseId<T>(`00000000-0000-7000-8009-${String(n).padStart(12, '0')}`));
}

function seedCatalog(uow: InMemoryPropertiesUnitOfWork) {
  const add = (n: number, kind: LocationKind, name: string, parent?: LocationSnapshot) => {
    const location: LocationSnapshot = {
      id: id<'Location'>(n),
      parentId: parent?.id,
      kind,
      name,
      path: `${parent?.path ?? '/'}${id<'Location'>(n)}/`,
      coordinates: undefined,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    };
    uow.locations.add(location);
    return location;
  };
  const argentina = add(1, 'country', 'Argentina');
  const caba = add(2, 'province', 'CABA', argentina);
  const cabaCity = add(3, 'city', 'CABA', caba);
  const villaLuro = add(4, 'neighborhood', 'Villa Luro', cabaCity);
  const buenosAires = add(5, 'province', 'Buenos Aires', argentina);
  add(6, 'city', 'La Matanza', buenosAires);
  return { villaLuro };
}

function setup(properties: TokkoApiProperty[] = [apiProperty()], configured = true) {
  const uow = new InMemoryPropertiesUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const storage = new InMemoryFileStorage();
  const photos = new Map(
    properties.flatMap((p) => p.photos.map((photo) => [photo.url, JPEG] as const)),
  );
  const source = new FakeTokkoPropertySource(properties, photos);
  const directory = new FakePropertyImportDirectory([
    { userId: PRODUCER_ID, name: 'Micaela Santo', branchId: BRANCH_ID },
  ]);
  const producers = new InMemoryProducers(new Map([[ADMIN_ID, { branchId: BRANCH_ID }]]));
  const imports = new InMemoryPropertyImportQuery(uow.propertyImports);
  const users = new InMemoryUserNames(new Map([[ADMIN_ID, 'Laura Admin']]));
  const catalog = seedCatalog(uow);
  return {
    uow,
    storage,
    source,
    directory,
    catalog,
    start: new StartTokkoApiPropertyImport({ uow, configured, ids, clock }),
    run: new RunTokkoApiPropertyImport({
      uow,
      source: configured ? source : undefined,
      storage,
      directory,
      producers,
      ids,
      clock,
    }),
    list: new ListPropertyImports({ imports, users }),
    problems: new ListPropertyImportProblems({ imports }),
  };
}

type Context = ReturnType<typeof setup>;

async function runImport(ctx: Context): Promise<string> {
  const { importId } = unwrap(await ctx.start.execute({}, ADMIN));
  unwrap(await ctx.run.execute({ importId }, JOB_ACTOR));
  return importId;
}

const byCode = (ctx: Context, code: string) =>
  [...ctx.uow.properties.rows.values()].find((p) => p.code === code);

const galleryOf = (ctx: Context, propertyId: string | undefined) =>
  [...ctx.uow.media.rows.values()]
    .filter((item) => item.owner.id === propertyId)
    .sort((a, b) => a.position - b.position);

describe('StartTokkoApiPropertyImport', () => {
  it('leaves the import pending for the job and audits who asked for it', async () => {
    const ctx = setup();
    const { importId } = unwrap(await ctx.start.execute({}, ADMIN));

    expect(ctx.uow.propertyImports.rows.get(importId)).toMatchObject({
      source: 'api',
      status: 'pending',
      requestedBy: ADMIN_ID,
    });
    expect(ctx.uow.events.published.map((e) => e.type)).toEqual([
      'properties.tokko_api_import_requested',
    ]);
    expect(ctx.uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property_import.requested',
        entityId: importId,
        changes: { source: { before: null, after: 'api' } },
      }),
    ]);
  });

  it('needs properties:import, the API key and no other import running', async () => {
    const ctx = setup();
    const agent = Actor.user(ADMIN_ID, ['properties:create']);
    expect(unwrapErr(await ctx.start.execute({}, agent))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await setup([], false).start.execute({}, ADMIN))).toEqual({
      type: 'TokkoApiNotConfigured',
    });

    unwrap(await ctx.start.execute({}, ADMIN));
    expect(unwrapErr(await ctx.start.execute({}, ADMIN))).toEqual({ type: 'ImportInProgress' });
  });
});

describe('Tokko API properties import', () => {
  it('creates a missing property with its title, description, coordinates and owners', async () => {
    const ctx = setup();
    const importId = await runImport(ctx);
    const casa = byCode(ctx, 'NHO1001');

    expect(casa).toMatchObject({
      kind: 'house',
      status: 'available',
      locationId: ctx.catalog.villaLuro.id,
      portalTitle: 'Casa con jardín en Villa Luro',
      description: 'Hermosa casa de 4 ambientes.',
      coordinates: { latitude: -34.6385, longitude: -58.5021 },
      producerUserId: PRODUCER_ID,
      characteristics: {
        rooms: 4,
        bedrooms: 3,
        bathrooms: 2,
        parkingSpaces: 1,
        ageYears: undefined,
      },
      internal: {
        internalComments:
          'Datos de Tokko\nPlantas: 2\nSuperficie descubierta: 10 m²\n\nComentarios de Tokko\nLlaves en la oficina.',
      },
    });
    expect(casa?.operations).toEqual([
      expect.objectContaining({ operation: 'sale', currency: 'USD', priceCents: 15_000_000n }),
      expect.objectContaining({ operation: 'rent', currency: 'ARS', priceCents: 70_000_000n }),
    ]);
    // Los dos propietarios de Tokko quedan vinculados y en `client_ids` del alta.
    const ownerIds = ctx.directory.owners.map((o) => o.clientId);
    expect(ownerIds).toHaveLength(2);
    expect(ctx.uow.audit.entries.find((e) => e.action === 'property.imported')).toMatchObject({
      entityId: casa?.id,
      clientIds: ownerIds,
      correlationId: importId,
    });
    expect(ctx.uow.propertyImports.rows.get(importId)).toMatchObject({
      status: 'done',
      totals: { rows: 1, processed: 1, created: 1, existing: 0, completed: 0, failed: 0 },
    });
  });

  it('downloads the photos in the Tokko order, with its cover and floor plans', async () => {
    const ctx = setup();
    await runImport(ctx);
    const casa = byCode(ctx, 'NHO1001');
    const gallery = galleryOf(ctx, casa?.id);

    expect(ctx.source.downloads).toEqual([
      photoUrl('NHO1001', 1),
      photoUrl('NHO1001', 2),
      photoUrl('NHO1001', 3),
    ]);
    expect(gallery.map((item) => [item.kind, item.isCover, item.processing])).toEqual([
      ['photo', true, 'pending'],
      ['photo', false, 'pending'],
      ['floor_plan', false, 'pending'],
    ]);
    for (const item of gallery) {
      expect(await ctx.storage.get(item.storageKey ?? '')).toBeDefined();
    }
    // Las variantes las genera el job de siempre.
    expect(
      ctx.uow.events.published.filter((e) => e.type === 'properties.media_variants_requested'),
    ).toHaveLength(3);
    expect(ctx.uow.audit.entries.map((e) => e.action)).toContain('property.media_added');
  });

  it('completes a property already imported without overwriting what Norde has', async () => {
    const existing = propertySnapshot({
      id: '00000000-0000-7000-8009-0000000000e1',
      code: 'NHO1001',
      description: '',
      coordinates: undefined,
      internal: { ...EMPTY_INTERNAL_INFO, internalComments: 'Datos de Tokko\nPlantas: 2' },
    });
    const described = propertySnapshot({
      id: '00000000-0000-7000-8009-0000000000e2',
      code: 'NAP2002',
      slug: 'otro-slug',
      description: 'La escribió Norde.',
      portalTitle: 'Título de Norde',
      coordinates: unwrap(Coordinates.create(-34.6, -58.4)),
    });
    const ctx = setup([
      apiProperty(),
      apiProperty({ referenceCode: 'NAP2002', photos: [], internalComments: undefined }),
    ]);
    ctx.uow.properties.rows.set(existing.id, existing);
    ctx.uow.properties.rows.set(described.id, described);
    const importId = await runImport(ctx);

    expect(ctx.uow.properties.rows.get(existing.id)).toMatchObject({
      description: 'Hermosa casa de 4 ambientes.',
      portalTitle: 'Casa con jardín en Villa Luro',
      coordinates: { latitude: -34.6385, longitude: -58.5021 },
      internal: {
        internalComments:
          'Datos de Tokko\nPlantas: 2\n\nComentarios de Tokko\nLlaves en la oficina.',
      },
    });
    expect(galleryOf(ctx, existing.id)).toHaveLength(3);
    expect(ctx.uow.properties.rows.get(described.id)).toMatchObject({
      description: 'La escribió Norde.',
      portalTitle: 'Título de Norde',
      coordinates: { latitude: -34.6, longitude: -58.4 },
    });
    // No se crea otra propiedad ni se vuelven a buscar los propietarios.
    expect(ctx.uow.properties.rows.size).toBe(2);
    expect(ctx.directory.owners).toEqual([]);
    expect(
      ctx.uow.audit.entries.find((e) => e.action === 'property.import_completed'),
    ).toMatchObject({
      entityId: existing.id,
      changes: {
        description: { before: '', after: 'Hermosa casa de 4 ambientes.' },
        latitude: { before: null, after: -34.6385 },
      },
    });
    expect(ctx.uow.propertyImports.rows.get(importId)).toMatchObject({
      totals: { processed: 2, created: 0, completed: 1, existing: 1 },
    });
  });

  it('runs again without duplicating anything', async () => {
    const ctx = setup();
    await runImport(ctx);
    const downloads = ctx.source.downloads.length;
    const secondId = await runImport(ctx);

    expect(ctx.uow.properties.rows.size).toBe(1);
    expect(galleryOf(ctx, byCode(ctx, 'NHO1001')?.id)).toHaveLength(3);
    expect(ctx.source.downloads).toHaveLength(downloads);
    expect(ctx.uow.propertyImports.rows.get(secondId)).toMatchObject({
      totals: { existing: 1, completed: 0, created: 0 },
    });
  });

  it('uses the web version of a photo that cannot be downloaded, and warns if none can', async () => {
    const original = photoUrl('NHO1001', 1);
    const web = 'https://static.tokkobroker.com/pictures/web-1.jpg';
    const ctx = setup([
      apiProperty({
        photos: [
          { url: original, fallbackUrl: web, order: 0, isCover: true, isFloorPlan: false },
          {
            url: photoUrl('NHO1001', 9),
            fallbackUrl: undefined,
            order: 1,
            isCover: false,
            isFloorPlan: false,
          },
        ],
      }),
    ]);
    ctx.source.photos.delete(original);
    ctx.source.photos.delete(photoUrl('NHO1001', 9));
    ctx.source.photos.set(web, JPEG);
    const importId = await runImport(ctx);
    const casa = byCode(ctx, 'NHO1001');

    expect(galleryOf(ctx, casa?.id)).toHaveLength(1);
    const problems = unwrap(await ctx.problems.execute({ importId }, ADMIN));
    expect(problems.items).toEqual([
      expect.objectContaining({
        rowNumber: 1,
        code: 'photos_not_downloaded',
        propertyId: casa?.id,
        reference: 'NHO1001',
      }),
    ]);
  });

  it('reports a property it cannot read with its Tokko code, and keeps going', async () => {
    const ctx = setup([
      apiProperty({ referenceCode: 'NXX0001', typeName: 'Castillo' }),
      apiProperty({ referenceCode: 'NAP 2002', photos: [] }),
    ]);
    const importId = await runImport(ctx);

    expect(byCode(ctx, 'NAP-2002')).toBeDefined();
    const problems = unwrap(await ctx.problems.execute({ importId }, ADMIN));
    expect(problems.items).toEqual([
      expect.objectContaining({ rowNumber: 1, code: 'unknown_type', reference: 'NXX0001' }),
    ]);
  });

  it('fails when Tokko stops answering, and a new run picks up from there', async () => {
    const properties = [
      apiProperty({ photos: [] }),
      ...Array.from({ length: 24 }, (_, i) =>
        apiProperty({ referenceCode: `NAP${String(3000 + i)}`, photos: [] }),
      ),
    ];
    const ctx = setup(properties);
    ctx.source.unavailableFrom = 20;
    const firstId = await runImport(ctx);

    expect(ctx.uow.propertyImports.rows.get(firstId)).toMatchObject({
      status: 'failed',
      failure: 'source_unavailable',
      totals: { processed: 20, created: 20 },
    });
    ctx.source.unavailableFrom = undefined;
    const secondId = await runImport(ctx);
    expect(ctx.uow.properties.rows.size).toBe(25);
    expect(ctx.uow.propertyImports.rows.get(secondId)).toMatchObject({
      status: 'done',
      totals: { rows: 25, created: 5, existing: 20 },
    });
  });

  it('resumes a cut job after the properties it already processed', async () => {
    const ctx = setup([
      apiProperty({ photos: [] }),
      apiProperty({ referenceCode: 'NAP2002', photos: [] }),
    ]);
    const { importId } = unwrap(await ctx.start.execute({}, ADMIN));
    const job = ctx.uow.propertyImports.rows.get(importId);
    if (!job) throw new Error('missing import');
    // El job se cortó después de procesar la primera.
    ctx.uow.propertyImports.rows.set(importId, {
      ...job,
      status: 'running',
      totals: { ...job.totals, rows: 2, processed: 1, failed: 1 },
    });
    unwrap(await ctx.run.execute({ importId }, JOB_ACTOR));

    expect(ctx.source.pages[0]).toEqual({ offset: 1, limit: 20 });
    expect([...ctx.uow.properties.rows.values()].map((p) => p.code)).toEqual(['NAP2002']);
  });

  it('fails without the API key, and runs only as the import job', async () => {
    const ctx = setup();
    const { importId } = unwrap(await ctx.start.execute({}, ADMIN));
    expect(unwrapErr(await ctx.run.execute({ importId }, ADMIN))).toEqual({ type: 'Forbidden' });

    const unconfigured = new RunTokkoApiPropertyImport({
      uow: ctx.uow,
      source: undefined,
      storage: ctx.storage,
      directory: ctx.directory,
      producers: new InMemoryProducers(),
      ids: new SequentialIdGenerator(),
      clock: new FixedClock(TEST_NOW),
    });
    expect(unwrap(await unconfigured.execute({ importId }, JOB_ACTOR))).toEqual({
      status: 'failed',
    });
  });

  it('shows the API imports in the history', async () => {
    const ctx = setup();
    await runImport(ctx);

    const page = unwrap(await ctx.list.execute({}, ADMIN));
    expect(page.items).toEqual([
      expect.objectContaining({
        source: 'api',
        fileName: '',
        requestedBy: { id: ADMIN_ID, name: 'Laura Admin' },
      }),
    ]);
  });
});
