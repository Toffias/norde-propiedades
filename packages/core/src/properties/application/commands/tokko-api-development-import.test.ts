import { describe, expect, it } from 'vitest';

import { InMemoryFileStorage } from '../../../settings/testing';
import { Actor, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap } from '../../../shared/testing';
import type { LocationKind, LocationSnapshot } from '../../domain/location';
import {
  BRANCH_ID,
  developmentSnapshot,
  FakePropertyImportDirectory,
  FakeTokkoPropertySource,
  InMemoryProducers,
  InMemoryPropertiesUnitOfWork,
  InMemoryPropertyImportQuery,
  PRODUCER_ID,
  propertySnapshot,
  TEST_NOW,
} from '../../testing';
import { RunTokkoApiPropertyImport } from '../handlers/run-tokko-api-property-import';
import type { TokkoApiDevelopment, TokkoApiProperty } from '../ports/tokko-property-source';
import { ListPropertyImportProblems } from '../queries/list-property-import-problems';

import { StartTokkoApiPropertyImport } from './start-tokko-api-property-import';

// Emprendimientos y unidades con la forma de la API de Tokko, con datos inventados.

const ADMIN_ID = '00000000-0000-7000-8000-0000000000a9';
const ADMIN = Actor.user(ADMIN_ID, ['properties:read', 'properties:import']).withBranch(BRANCH_ID);
const JOB_ACTOR = Actor.system('import', ['properties:run-imports']);
const JPEG = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), contentType: 'image/jpeg' };
const PHOTO = 'https://static.tokkobroker.com/pictures/dev-1.jpg';

function apiDevelopment(overrides: Partial<TokkoApiDevelopment> = {}): TokkoApiDevelopment {
  return {
    referenceCode: 'NBU58303',
    name: 'AV. RIVADAVIA 9540  + EN POZO',
    typeCode: 'BU',
    address: 'Av. Rivadavia 9540',
    fullLocation: 'Argentina | Capital Federal | Villa Luro ',
    constructionStatus: 3,
    constructionDate: '2028-12-01',
    displayOnWeb: true,
    title: 'Rivadavia 9540, en pozo',
    description: 'Edificio de 10 pisos con amenities.',
    financingDetails: 'Anticipo y 36 cuotas.',
    latitude: -34.6385,
    longitude: -58.5021,
    producerName: 'Micaela Santo',
    photos: [{ url: PHOTO, fallbackUrl: undefined, order: 0, isCover: true, isFloorPlan: false }],
    ...overrides,
  };
}

/** Una unidad del emprendimiento, sin fotos para que el test se enfoque en el vínculo. */
function unit(code: string): TokkoApiProperty {
  return {
    referenceCode: code,
    typeName: 'Departamento',
    address: 'Av. Rivadavia 9540 4º A',
    floor: undefined,
    unit: undefined,
    fullLocation: 'Argentina | Capital Federal | Villa Luro ',
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
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    toilets: undefined,
    parkingSpaces: undefined,
    age: undefined,
    expenses: undefined,
    floors: undefined,
    zoning: undefined,
    title: undefined,
    description: undefined,
    internalComments: undefined,
    latitude: undefined,
    longitude: undefined,
    owners: [],
    developmentCode: 'NBU58303',
    developmentName: 'AV. RIVADAVIA 9540  + EN POZO',
    photos: [],
  };
}

function id<T extends string>(n: number) {
  return unwrap(parseId<T>(`00000000-0000-7000-800a-${String(n).padStart(12, '0')}`));
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
  return { villaLuro: add(4, 'neighborhood', 'Villa Luro', cabaCity) };
}

function setup(
  developments: TokkoApiDevelopment[],
  properties: TokkoApiProperty[] = [],
  namedInNorde: { id: string; name: string }[] = [],
) {
  const uow = new InMemoryPropertiesUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const storage = new InMemoryFileStorage();
  const source = new FakeTokkoPropertySource(properties, new Map([[PHOTO, JPEG]]), developments);
  const directory = new FakePropertyImportDirectory(
    [{ userId: PRODUCER_ID, name: 'Micaela Santo', branchId: BRANCH_ID }],
    namedInNorde,
  );
  const producers = new InMemoryProducers(new Map([[ADMIN_ID, { branchId: BRANCH_ID }]]));
  const catalog = seedCatalog(uow);
  const deps = { uow, storage, directory, producers, ids, clock };
  return {
    uow,
    source,
    catalog,
    start: new StartTokkoApiPropertyImport({ uow, configured: true, ids, clock }),
    run: new RunTokkoApiPropertyImport({ ...deps, source }),
    problems: new ListPropertyImportProblems({
      imports: new InMemoryPropertyImportQuery(uow.propertyImports),
    }),
  };
}

type Context = ReturnType<typeof setup>;

async function runImport(ctx: Context): Promise<string> {
  const { importId } = unwrap(await ctx.start.execute({}, ADMIN));
  unwrap(await ctx.run.execute({ importId }, JOB_ACTOR));
  return importId;
}

const developmentByCode = (ctx: Context, code: string) =>
  [...ctx.uow.developments.rows.values()].find((d) => d.code === code);
const propertyByCode = (ctx: Context, code: string) =>
  [...ctx.uow.properties.rows.values()].find((p) => p.code === code);

describe('Tokko API developments import', () => {
  it('creates a missing development with its Tokko code, status, works and photos', async () => {
    const ctx = setup([apiDevelopment()]);
    const importId = await runImport(ctx);
    const development = developmentByCode(ctx, 'NBU58303');

    expect(development).toMatchObject({
      name: 'AV. RIVADAVIA 9540',
      kind: 'building',
      // Publicado en la web de Tokko: comercializando.
      status: 'marketing',
      constructionStatus: 'pre_sale',
      deliveryDate: '2028-12-01',
      privateAddress: 'Av. Rivadavia 9540',
      portalTitle: 'Rivadavia 9540, en pozo',
      description: 'Edificio de 10 pisos con amenities.',
      financingDetails: 'Anticipo y 36 cuotas.',
      locationId: ctx.catalog.villaLuro.id,
      coordinates: { latitude: -34.6385, longitude: -58.5021 },
      producerUserId: PRODUCER_ID,
    });
    const gallery = [...ctx.uow.media.rows.values()].filter(
      (item) => item.owner.id === development?.id,
    );
    expect(gallery).toEqual([expect.objectContaining({ kind: 'photo', isCover: true })]);
    expect(ctx.uow.audit.entries.find((e) => e.action === 'development.imported')).toMatchObject({
      entityId: development?.id,
      correlationId: importId,
    });
    expect(ctx.uow.propertyImports.rows.get(importId)?.totals.developments).toEqual({
      created: 1,
      existing: 0,
      completed: 0,
      failed: 0,
    });
  });

  it('links the units to the development created in the same run', async () => {
    const ctx = setup([apiDevelopment()], [unit('NBU58303 AP0000001')]);
    await runImport(ctx);

    expect(propertyByCode(ctx, 'NBU58303-AP0000001')?.developmentId).toBe(
      developmentByCode(ctx, 'NBU58303')?.id,
    );
  });

  it('completes a development already in Norde, found by name, without overwriting', async () => {
    const existing = developmentSnapshot({
      code: 'EMP0001',
      name: 'Av. Rivadavia 9540',
      description: 'La escribió Norde.',
      constructionStatus: undefined,
      locationId: id<'Location'>(4),
    });
    const ctx = setup([apiDevelopment()], [], [{ id: existing.id, name: 'Av. Rivadavia 9540' }]);
    ctx.uow.developments.rows.set(existing.id, existing);
    const importId = await runImport(ctx);

    expect(ctx.uow.developments.rows.size).toBe(1);
    expect(ctx.uow.developments.rows.get(existing.id)).toMatchObject({
      code: 'EMP0001',
      status: 'loading',
      description: 'La escribió Norde.',
      constructionStatus: 'pre_sale',
      deliveryDate: '2028-12-01',
      financingDetails: 'Anticipo y 36 cuotas.',
      coordinates: { latitude: -34.6385, longitude: -58.5021 },
    });
    expect(
      [...ctx.uow.media.rows.values()].filter((item) => item.owner.id === existing.id),
    ).toHaveLength(1);
    expect(
      ctx.uow.audit.entries.find((e) => e.action === 'development.import_completed'),
    ).toMatchObject({
      entityId: existing.id,
      changes: { constructionStatus: { before: null, after: 'pre_sale' } },
    });
    expect(ctx.uow.propertyImports.rows.get(importId)?.totals.developments).toMatchObject({
      completed: 1,
    });
  });

  it('joins a loose unit already in Norde to its development', async () => {
    const loose = propertySnapshot({
      id: '00000000-0000-7000-800a-0000000000e1',
      code: 'NBU58303-AP0000001',
      developmentId: undefined,
    });
    const ctx = setup([apiDevelopment({ photos: [] })], [unit('NBU58303 AP0000001')]);
    ctx.uow.properties.rows.set(loose.id, loose);
    const importId = await runImport(ctx);
    const development = developmentByCode(ctx, 'NBU58303');

    expect(ctx.uow.properties.rows.get(loose.id)?.developmentId).toBe(development?.id);
    const actions = ctx.uow.audit.entries.map((e) => [e.action, e.entityId]);
    expect(actions).toContainEqual(['development.unit_added', development?.id]);
    expect(actions).toContainEqual(['property.import_completed', loose.id]);
    expect(ctx.uow.propertyImports.rows.get(importId)?.totals).toMatchObject({
      completed: 1,
    });
  });

  it('keeps a development loading when Tokko did not publish it, and reports one it cannot place', async () => {
    const ctx = setup([
      apiDevelopment({ displayOnWeb: false, constructionStatus: 6 }),
      apiDevelopment({
        referenceCode: 'NBU99999',
        name: 'Torre Montevideo',
        fullLocation: 'Uruguay | Montevideo | Montevideo | Pocitos',
      }),
    ]);
    const importId = await runImport(ctx);

    expect(developmentByCode(ctx, 'NBU58303')).toMatchObject({
      status: 'loading',
      constructionStatus: 'finished',
    });
    expect(developmentByCode(ctx, 'NBU99999')).toBeUndefined();
    const problems = unwrap(await ctx.problems.execute({ importId }, ADMIN));
    expect(problems.items).toEqual([
      expect.objectContaining({
        code: 'location_not_found',
        reference: 'NBU99999',
        subject: 'development',
      }),
    ]);
  });

  it('runs again without duplicating developments, and fails if Tokko does not answer', async () => {
    const ctx = setup([apiDevelopment()]);
    await runImport(ctx);
    const second = await runImport(ctx);

    expect(ctx.uow.developments.rows.size).toBe(1);
    expect(ctx.uow.propertyImports.rows.get(second)?.totals.developments).toMatchObject({
      existing: 1,
      created: 0,
    });

    ctx.source.developmentsUnavailable = true;
    const failed = await runImport(ctx);
    expect(ctx.uow.propertyImports.rows.get(failed)).toMatchObject({
      status: 'failed',
      failure: 'source_unavailable',
    });
  });
});
