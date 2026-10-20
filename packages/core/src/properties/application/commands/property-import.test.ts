import { describe, expect, it } from 'vitest';

import { InMemoryFileStorage } from '../../../settings/testing';
import { Actor, parseId } from '../../../shared';
import {
  FakeSpreadsheetReader,
  FixedClock,
  SequentialIdGenerator,
  unwrap,
  unwrapErr,
} from '../../../shared/testing';
import type { LocationKind, LocationSnapshot } from '../../domain/location';
import { TOKKO_PROPERTY_COLUMNS, type PropertyImportField } from '../../domain/property-import';
import {
  BRANCH_ID,
  DEVELOPMENT_ID,
  developmentSnapshot,
  FakePropertyImportDirectory,
  InMemoryProducers,
  InMemoryPropertiesUnitOfWork,
  InMemoryPropertyImportQuery,
  InMemoryUserNames,
  PRODUCER_ID,
  propertySnapshot,
  TEST_NOW,
} from '../../testing';
import { RunPropertyImport } from '../handlers/run-property-import';
import { GetPropertyImport } from '../queries/get-property-import';
import { ListPropertyImportProblems } from '../queries/list-property-import-problems';
import { ListPropertyImports } from '../queries/list-property-imports';
import { PreviewPropertyImport } from '../queries/preview-property-import';

import { StartPropertyImport } from './start-property-import';

// La exportación de propiedades de Tokko (`.csv`), con datos inventados.

const ADMIN_ID = '00000000-0000-7000-8000-0000000000a9';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const ADMIN = Actor.user(ADMIN_ID, ['properties:read', 'properties:import']).withBranch(BRANCH_ID);
const JOB_ACTOR = Actor.system('import', ['properties:run-imports']);

const FIELDS: readonly PropertyImportField[] = [
  'code',
  'country',
  'region',
  'neighborhood',
  'address',
  'propertyType',
  'producer',
  'surfaceTotal',
  'surfaceCovered',
  'surfaceSemiCovered',
  'surfaceUncovered',
  'rooms',
  'bathrooms',
  'floors',
  'occupation',
  'expenses',
  'salePrice',
  'rentPrice',
  'ownerName',
  'ownerEmail',
  'ownerPhone',
  'development',
];
const HEADERS = FIELDS.map((field) => TOKKO_PROPERTY_COLUMNS[field]);

type Row = Partial<Record<PropertyImportField, string>>;
const cells = (row: Row) => FIELDS.map((field) => row[field]);

const CASA: Row = {
  code: 'NHO1001',
  country: 'Argentina',
  region: 'Capital Federal',
  neighborhood: 'Villa Luro',
  address: 'Calle Falsa 123',
  propertyType: 'Casa',
  producer: 'micaela santo',
  surfaceTotal: '120.00 m2',
  surfaceCovered: '100.00 m2',
  surfaceSemiCovered: '10.00 m2',
  surfaceUncovered: '10.00 m2',
  rooms: '4',
  bathrooms: '2',
  floors: '2',
  occupation: 'Vacía ',
  expenses: '0',
  salePrice: 'USD 150.000',
  rentPrice: '$ 700.000',
  ownerName: 'Ana Prueba',
  ownerEmail: '-',
  ownerPhone: '5491100000001',
  development: '',
};

const UNIDAD: Row = {
  code: 'NAP2002',
  country: 'Argentina',
  region: 'G.B.A. Zona Oeste',
  neighborhood: 'Ramos Mejia',
  address: 'Av. Siempre Viva 742 3º B',
  propertyType: 'Departamento',
  producer: 'Libre',
  salePrice: 'USD 90.000',
  rentPrice: '-',
  expenses: '60000',
  ownerName: 'Bruno Prueba',
  ownerPhone: '15 4401 7116',
  development: 'TORRE GURRUCHAGA + EN POZO',
};

function id<T extends string>(n: number) {
  return unwrap(parseId<T>(`00000000-0000-7000-8007-${String(n).padStart(12, '0')}`));
}

/** Argentina, CABA (provincia y ciudad, con Villa Luro) y Buenos Aires con La Matanza. */
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
  const laMatanza = add(6, 'city', 'La Matanza', buenosAires);
  return { villaLuro, laMatanza };
}

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const reader = new FakeSpreadsheetReader();
  const storage = new InMemoryFileStorage();
  const directory = new FakePropertyImportDirectory(
    [{ userId: PRODUCER_ID, name: 'Micaela Santo', branchId: OTHER_BRANCH }],
    [{ id: DEVELOPMENT_ID, name: 'Torre Gurruchaga' }],
  );
  const producers = new InMemoryProducers(new Map([[ADMIN_ID, { branchId: BRANCH_ID }]]));
  const imports = new InMemoryPropertyImportQuery(uow.propertyImports);
  const users = new InMemoryUserNames(new Map([[ADMIN_ID, 'Laura Admin']]));
  const catalog = seedCatalog(uow);
  const development = developmentSnapshot();
  uow.developments.rows.set(development.id, development);
  return {
    uow,
    reader,
    storage,
    directory,
    catalog,
    preview: new PreviewPropertyImport({ reader }),
    start: new StartPropertyImport({ uow, reader, storage, ids, clock }),
    run: new RunPropertyImport({ uow, reader, storage, directory, producers, ids, clock }),
    list: new ListPropertyImports({ imports, users }),
    get: new GetPropertyImport({ imports, users }),
    problems: new ListPropertyImportProblems({ imports }),
  };
}

type Context = ReturnType<typeof setup>;

async function importRows(ctx: Context, rows: readonly Row[]): Promise<string> {
  const bytes = ctx.reader.register('tokko', [HEADERS, ...rows.map(cells)]);
  const { importId } = unwrap(
    await ctx.start.execute({ fileName: 'Propiedades.csv', bytes }, ADMIN),
  );
  unwrap(await ctx.run.execute({ importId }, JOB_ACTOR));
  return importId;
}

const byCode = (ctx: Context, code: string) =>
  [...ctx.uow.properties.rows.values()].find((p) => p.code === code);

describe('PreviewPropertyImport', () => {
  it('recognizes the Tokko export and tells what it brings', async () => {
    const ctx = setup();
    const bytes = ctx.reader.register('tokko', [HEADERS, cells(CASA)]);

    expect(unwrap(await ctx.preview.execute({ fileName: 'x.csv', bytes }, ADMIN))).toEqual({
      rowCount: 1,
      fields: FIELDS,
    });
  });

  it('rejects another file and needs properties:import', async () => {
    const ctx = setup();
    const other = ctx.reader.register('otro', [
      ['Nombre', 'Celular'],
      ['Ana', '1'],
    ]);

    expect(
      unwrapErr(await ctx.preview.execute({ fileName: 'x.csv', bytes: other }, ADMIN)),
    ).toEqual({ type: 'NotATokkoExport', missing: ['Ref', 'Dirección', 'Tipo de propiedad'] });
    const agent = Actor.user(ADMIN_ID, ['properties:create']);
    expect(
      unwrapErr(await ctx.preview.execute({ fileName: 'x.csv', bytes: other }, agent)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('Tokko properties import', () => {
  it('creates each property available, with its Tokko code, place, operations and data', async () => {
    const ctx = setup();
    await importRows(ctx, [CASA]);

    const casa = byCode(ctx, 'NHO1001');
    expect(casa).toMatchObject({
      kind: 'house',
      status: 'available',
      locationId: ctx.catalog.villaLuro.id,
      address: {
        street: 'Calle Falsa',
        streetNumber: '123',
        neighborhood: 'Villa Luro',
        city: 'CABA',
        province: 'CABA',
      },
      producerUserId: PRODUCER_ID,
      branchId: OTHER_BRANCH,
      characteristics: {
        rooms: 4,
        bathrooms: 2,
        surfaceTotalM2: 120,
        surfaceCoveredM2: 100,
        surfaceSemiCoveredM2: 10,
      },
      deal: { expensesCents: undefined },
      internal: {
        internalComments:
          'Datos de Tokko\nPlantas: 2\nOcupación: Vacía\nSuperficie descubierta: 10 m²',
      },
    });
    expect(casa?.operations).toEqual([
      expect.objectContaining({ operation: 'sale', currency: 'USD', priceCents: 15_000_000n }),
      expect.objectContaining({ operation: 'rent', currency: 'ARS', priceCents: 70_000_000n }),
    ]);
  });

  it('links the owner contact, created as owner and assigned to the producer', async () => {
    const ctx = setup();
    await importRows(ctx, [CASA]);
    const casa = byCode(ctx, 'NHO1001');

    expect(ctx.directory.owners).toEqual([
      expect.objectContaining({
        name: 'Ana Prueba',
        phone: '5491100000001',
        email: undefined,
        sells: true,
        rents: true,
        agentId: PRODUCER_ID,
      }),
    ]);
    const ownerId = ctx.directory.owners[0]?.clientId;
    expect([...ctx.uow.owners.rows.keys()]).toEqual([`${casa?.id ?? ''}:${ownerId ?? ''}`]);
    // El alta lleva al propietario en `client_ids`: su supresión la encuentra.
    expect(ctx.uow.audit.entries.find((e) => e.action === 'property.imported')).toMatchObject({
      entityId: casa?.id,
      actorId: 'system:import',
      clientIds: [ownerId],
    });
  });

  it('puts a GBA locality under its partido, creating it, and makes it a development unit', async () => {
    const ctx = setup();
    const importId = await importRows(ctx, [UNIDAD]);
    const unidad = byCode(ctx, 'NAP2002');

    const ramos = [...ctx.uow.locations.rows.values()].find((l) => l.name === 'Ramos Mejia');
    expect(ramos).toMatchObject({ kind: 'neighborhood', parentId: ctx.catalog.laMatanza.id });
    expect(unidad).toMatchObject({
      locationId: ramos?.id,
      developmentId: DEVELOPMENT_ID,
      address: { floor: '3', unit: 'B', city: 'La Matanza', province: 'Buenos Aires' },
      // "Libre" no tiene productor: queda quien importó.
      producerUserId: ADMIN_ID,
      branchId: BRANCH_ID,
      deal: { expensesCents: 6_000_000n },
    });
    const actions = ctx.uow.audit.entries
      .filter((e) => e.correlationId === importId)
      .map((e) => e.action);
    expect(actions).toEqual([
      'location.created',
      'property.imported',
      'development.unit_added',
      'property_import.finished',
    ]);
  });

  it('warns without stopping when the owner has no valid contact or the development is missing', async () => {
    const ctx = setup();
    const importId = await importRows(ctx, [
      { ...UNIDAD, ownerPhone: '', ownerEmail: '', development: 'Otro Emprendimiento + TERMINADO' },
    ]);
    const unidad = byCode(ctx, 'NAP2002');

    expect(unidad?.developmentId).toBeUndefined();
    expect(ctx.uow.propertyImports.rows.get(importId)).toMatchObject({
      totals: { created: 1, existing: 0, failed: 0 },
    });
    // Sin teléfono ni email no hay propietario: queda como aviso, con la propiedad creada.
    expect(ctx.uow.propertyImports.problems.map((p) => [p.code, p.field, p.propertyId])).toEqual([
      ['owner_not_linked', 'ownerPhone', unidad?.id],
      ['development_not_found', 'development', unidad?.id],
    ]);
    expect(ctx.uow.owners.rows.size).toBe(0);
  });

  it('does not import again a code that already exists, and reports invalid rows', async () => {
    const ctx = setup();
    const trashed = propertySnapshot({ code: 'NAP2002', deletedAt: TEST_NOW });
    ctx.uow.properties.rows.set(trashed.id, trashed);
    await importRows(ctx, [CASA]);

    const second = await importRows(ctx, [
      CASA,
      UNIDAD,
      { ...CASA, code: 'NHO1003', propertyType: 'Bóveda' },
      { ...CASA, code: 'NHO1004', salePrice: '-', rentPrice: '-' },
      { ...CASA, code: 'NHO1005', surfaceCovered: '500.00 m2' },
    ]);

    expect(ctx.uow.propertyImports.rows.get(second)).toMatchObject({
      totals: { rows: 5, created: 0, existing: 1, failed: 4 },
    });
    expect(
      ctx.uow.propertyImports.problems
        .filter((p) => p.importId === second)
        .map((p) => [p.rowNumber, p.code, p.field]),
    ).toEqual([
      [2, 'already_imported', 'code'],
      [3, 'code_in_trash', 'code'],
      [4, 'unknown_type', 'propertyType'],
      [5, 'missing_operation', 'salePrice'],
      [6, 'invalid_value', 'surfaceCovered'],
    ]);
    expect([...ctx.uow.properties.rows.values()]).toHaveLength(2);
  });

  it('lists the imports and their problems for who can import', async () => {
    const ctx = setup();
    const importId = await importRows(ctx, [CASA, CASA]);

    const list = unwrap(await ctx.list.execute({}, ADMIN));
    expect(list.items).toEqual([
      expect.objectContaining({
        id: importId,
        status: 'done',
        requestedBy: { id: ADMIN_ID, name: 'Laura Admin' },
        totals: { rows: 2, processed: 2, created: 1, existing: 1, failed: 0 },
      }),
    ]);
    expect(unwrap(await ctx.get.execute({ importId }, ADMIN)).id).toBe(importId);
    expect(unwrap(await ctx.problems.execute({ importId }, ADMIN)).items).toEqual([
      {
        rowNumber: 3,
        code: 'already_imported',
        field: 'code',
        propertyId: byCode(ctx, 'NHO1001')?.id,
      },
    ]);
    const agent = Actor.user(ADMIN_ID, ['properties:read']);
    expect(unwrapErr(await ctx.list.execute({}, agent))).toEqual({ type: 'Forbidden' });
  });

  it('runs only as the import job and does nothing for a finished import', async () => {
    const ctx = setup();
    const importId = await importRows(ctx, [CASA]);
    const audited = ctx.uow.audit.entries.length;

    expect(unwrapErr(await ctx.run.execute({ importId }, ADMIN))).toEqual({ type: 'Forbidden' });
    expect(unwrap(await ctx.run.execute({ importId }, JOB_ACTOR))).toEqual({ status: 'done' });
    expect(ctx.uow.audit.entries).toHaveLength(audited);
    expect(ctx.storage.objects.size).toBe(0);
  });
});
