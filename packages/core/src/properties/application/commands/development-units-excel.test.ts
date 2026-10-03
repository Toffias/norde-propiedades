import { describe, expect, it } from 'vitest';

import { InMemoryFileStorage } from '../../../settings/testing';
import { Actor } from '../../../shared';
import {
  FakeSpreadsheetReader,
  FixedClock,
  SequentialIdGenerator,
  unwrap,
  unwrapErr,
} from '../../../shared/testing';
import type { StartDevelopmentUnitImportInput } from '../../contracts';
import {
  aPanelItem,
  BRANCH_ID,
  DEVELOPMENT_ID,
  developmentSnapshot,
  FakeDevelopmentUnitsExportWriter,
  FakeReferenceCodeAllocator,
  InMemoryDevelopmentUnitImportQuery,
  InMemoryPropertiesUnitOfWork,
  InMemoryUserNames,
  PRODUCER_ID,
  propertySnapshot,
  StubPanelPropertyListQuery,
  TEST_DEVELOPER,
  TEST_DEVELOPMENTS_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { RunDevelopmentUnitImport } from '../handlers/run-development-unit-import';
import { ListDevelopmentUnitImportProblems } from '../queries/list-development-unit-import-problems';
import { ListDevelopmentUnitImports } from '../queries/list-development-unit-imports';
import { PreviewDevelopmentUnitImport } from '../queries/preview-development-unit-import';

import { GetDevelopmentUnitImport } from '../queries/get-development-unit-import';

import { ExportDevelopmentUnits } from './export-development-units';
import { StartDevelopmentUnitImport } from './start-development-unit-import';

const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const OTHER_DEVELOPMENT = '00000000-0000-7000-8000-0000000000e2';
const UNIT_4A = '00000000-0000-7000-8000-0000000000c4';
const UNIT_5B = '00000000-0000-7000-8000-0000000000c5';

const JOB_ACTOR = Actor.system('import', ['properties:run-imports', 'properties:create']);
/** Edita los emprendimientos de otra sucursal: no puede importar en este. */
const OTHER_BRANCH_EDITOR = Actor.user('00000000-0000-7000-8000-0000000000a5', [
  'developments:read',
  'developments:update-branch',
  'properties:create',
]).withBranch(OTHER_BRANCH);
/** Puede exportar hasta 10 propiedades. */
const EXPORTER = Actor.user(PRODUCER_ID, ['developments:read', 'properties:export']);

const HEADERS = [
  'Código',
  'Piso',
  'Unidad',
  'Tipo',
  'Ambientes',
  'Sup. total (m²)',
  'Sup. cubierta (m²)',
  'Venta: moneda',
  'Venta: precio',
  'Estado',
];
const MAPPING = {
  floor: 1,
  unit: 2,
  propertyType: 3,
  rooms: 4,
  surfaceTotalM2: 5,
  surfaceCoveredM2: 6,
  saleCurrency: 7,
  salePrice: 8,
  status: 9,
};

function setup(options: { readonly codes?: boolean } = {}) {
  const uow = new InMemoryPropertiesUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const reader = new FakeSpreadsheetReader();
  const storage = new InMemoryFileStorage();
  const codes = new FakeReferenceCodeAllocator(options.codes ?? true);
  const imports = new InMemoryDevelopmentUnitImportQuery(uow.unitImports);
  const users = new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ruiz']]));
  const development = developmentSnapshot();
  uow.developments.rows.set(development.id, development);
  return {
    uow,
    reader,
    storage,
    codes,
    clock,
    preview: new PreviewDevelopmentUnitImport({ uow, reader }),
    start: new StartDevelopmentUnitImport({ uow, reader, storage, ids, clock }),
    run: new RunDevelopmentUnitImport({ uow, reader, storage, codes, ids, clock }),
    list: new ListDevelopmentUnitImports({ uow, imports, users }),
    get: new GetDevelopmentUnitImport({ uow, imports, users }),
    problems: new ListDevelopmentUnitImportProblems({ uow, imports }),
  };
}

type Setup = ReturnType<typeof setup>;

/** Una unidad del emprendimiento ya cargada, con su piso y unidad. */
function withUnit(
  uow: InMemoryPropertiesUnitOfWork,
  id: string,
  designation: { readonly floor: string; readonly unit: string },
  overrides: Parameters<typeof propertySnapshot>[0] = {},
) {
  const base = propertySnapshot({ id, developmentId: DEVELOPMENT_ID, ...overrides });
  const snapshot = { ...base, address: { ...base.address, ...designation } };
  uow.properties.rows.set(id, snapshot);
  return snapshot;
}

/** Sube la planilla, pide la importación y corre el job. */
async function importRows(
  s: Setup,
  rows: readonly (readonly (string | undefined)[])[],
  actor: Actor = TEST_DEVELOPER,
) {
  const bytes = s.reader.register(`unidades-${String(s.uow.unitImports.rows.size)}`, [
    HEADERS,
    ...rows,
  ]);
  const input: StartDevelopmentUnitImportInput = {
    developmentId: DEVELOPMENT_ID,
    fileName: 'unidades.xlsx',
    bytes,
    mapping: MAPPING,
  };
  const { importId } = unwrap(await s.start.execute(input, actor));
  unwrap(await s.run.execute({ importId }, JOB_ACTOR));
  const job = s.uow.unitImports.rows.get(importId);
  if (!job) throw new Error('The import was not stored');
  return job;
}

const row = (cells: Partial<Record<keyof typeof MAPPING, string>>) => {
  const out: (string | undefined)[] = [];
  for (const [field, column] of Object.entries(MAPPING)) {
    out[column] = cells[field as keyof typeof MAPPING];
  }
  return out;
};

describe('ExportDevelopmentUnits', () => {
  function exporter(items = [aPanelItem({ id: UNIT_4A, floor: '4', unit: 'A' })]) {
    const s = setup();
    const list = new StubPanelPropertyListQuery({ items, total: items.length });
    const writer = new FakeDevelopmentUnitsExportWriter();
    const use = new ExportDevelopmentUnits({
      uow: s.uow,
      list,
      users: new InMemoryUserNames(),
      writer,
      clock: s.clock,
    });
    return { ...s, list, writer, use };
  }

  it('writes the units of the development and records the export in its history', async () => {
    const { use, list, writer, uow } = exporter();

    const file = unwrap(await use.execute({ developmentId: DEVELOPMENT_ID }, EXPORTER));
    for await (const _chunk of file.body) {
      // La planilla se arma a medida que se lee.
    }

    expect(list.calls[0]).toMatchObject({ developmentId: DEVELOPMENT_ID, view: 'active' });
    expect(writer.developmentCode).toBe('EMP0001');
    expect(writer.rows.map((r) => [r.floor, r.unit])).toEqual([['4', 'A']]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'development.units_exported',
        entityType: 'development',
        entityId: DEVELOPMENT_ID,
        changes: { count: { before: null, after: 1 } },
      }),
    ]);
  });

  it('asks for the bulk permission past ten units', async () => {
    const items = Array.from({ length: 11 }, (_, index) =>
      aPanelItem({ id: `00000000-0000-7000-8000-${String(index).padStart(12, '0')}` }),
    );
    const { use } = exporter(items);

    expect(unwrapErr(await use.execute({ developmentId: DEVELOPMENT_ID }, EXPORTER))).toEqual({
      type: 'Forbidden',
    });
    unwrap(await use.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER));
  });

  it('rejects a development without units, an unknown one and an actor without export', async () => {
    const { use } = exporter([]);

    expect(unwrapErr(await use.execute({ developmentId: DEVELOPMENT_ID }, EXPORTER))).toEqual({
      type: 'NothingToExport',
    });
    expect(unwrapErr(await use.execute({ developmentId: OTHER_DEVELOPMENT }, EXPORTER))).toEqual({
      type: 'DevelopmentNotFound',
    });
    expect(unwrapErr(await use.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER))).toEqual(
      { type: 'Forbidden' },
    );
  });
});

describe('PreviewDevelopmentUnitImport', () => {
  it('reads the headers, a sample and the row count, and suggests the mapping', async () => {
    const { reader, preview } = setup();
    const bytes = reader.register('lista', [
      ['Piso', 'Depto', 'Precio'],
      ['4', 'A', '150000'],
    ]);

    const result = unwrap(
      await preview.execute(
        { developmentId: DEVELOPMENT_ID, fileName: 'lista.xlsx', bytes },
        TEST_DEVELOPER,
      ),
    );

    expect(result).toEqual({
      headers: ['Piso', 'Depto', 'Precio'],
      sample: [['4', 'A', '150000']],
      rowCount: 1,
      suggestedMapping: { floor: 0, unit: 1, salePrice: 2 },
    });
  });

  it('rejects an unreadable file, an empty one and an editor of another branch', async () => {
    const { reader, preview } = setup();
    const empty = reader.register('vacio', [['Unidad']]);
    const input = (bytes: Uint8Array<ArrayBuffer>) => ({
      developmentId: DEVELOPMENT_ID,
      fileName: 'x.xlsx',
      bytes,
    });

    expect(
      unwrapErr(await preview.execute(input(new TextEncoder().encode('?')), TEST_DEVELOPER)),
    ).toEqual({ type: 'UnreadableSpreadsheet' });
    expect(unwrapErr(await preview.execute(input(empty), TEST_DEVELOPER))).toEqual({
      type: 'EmptyImportFile',
    });
    expect(unwrapErr(await preview.execute(input(empty), OTHER_BRANCH_EDITOR))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await preview.execute(input(empty), TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('StartDevelopmentUnitImport', () => {
  it('stores the file, leaves the import pending and records it in the development history', async () => {
    const { reader, start, storage, uow } = setup();
    const bytes = reader.register('unidades', [HEADERS, row({ unit: 'A' })]);

    const { importId } = unwrap(
      await start.execute(
        { developmentId: DEVELOPMENT_ID, fileName: 'unidades.xlsx', bytes, mapping: MAPPING },
        TEST_DEVELOPER,
      ),
    );

    expect(storage.objects.has(`imports/development-units/${importId}`)).toBe(true);
    expect(uow.unitImports.rows.get(importId)).toMatchObject({
      developmentId: DEVELOPMENT_ID,
      status: 'pending',
      canMarkAvailable: false,
      requestedBy: PRODUCER_ID,
      totals: { rows: 1 },
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['properties.unit_import_requested']);
    expect(uow.audit.entries).toMatchObject([
      {
        action: 'development.units_import_requested',
        entityId: DEVELOPMENT_ID,
        changes: {
          importId: { before: null, after: importId },
          rows: { before: null, after: 1 },
        },
      },
    ]);
  });

  it('rejects a mapping without unit, a development in the trash and another branch', async () => {
    const { reader, start, storage, uow } = setup();
    const bytes = reader.register('unidades', [HEADERS, row({ unit: 'A' })]);
    const input = { developmentId: DEVELOPMENT_ID, fileName: 'u.xlsx', bytes, mapping: MAPPING };

    expect(
      unwrapErr(await start.execute({ ...input, mapping: { floor: 1 } }, TEST_DEVELOPER)),
    ).toEqual({ type: 'InvalidUnitImportMapping', reason: 'missing_unit' });
    expect(unwrapErr(await start.execute(input, OTHER_BRANCH_EDITOR))).toEqual({
      type: 'Forbidden',
    });
    uow.developments.rows.set(
      DEVELOPMENT_ID,
      developmentSnapshot({ deletedAt: TEST_NOW, deletedBy: PRODUCER_ID }),
    );
    expect(unwrapErr(await start.execute(input, TEST_DEVELOPER))).toEqual({
      type: 'DevelopmentInTrash',
    });
    expect(storage.objects.size).toBe(0);
    expect(uow.unitImports.rows.size).toBe(0);
  });
});

describe('RunDevelopmentUnitImport', () => {
  it('creates a new unit inheriting the development data, audited as the import', async () => {
    const s = setup();

    const job = await importRows(s, [
      row({
        floor: '4',
        unit: 'A',
        propertyType: 'Departamento',
        rooms: '3',
        surfaceTotalM2: '80',
        surfaceCoveredM2: '72',
        saleCurrency: 'USD',
        salePrice: '150.000',
      }),
    ]);

    expect(job).toMatchObject({ status: 'done', totals: { rows: 1, created: 1, failed: 0 } });
    expect(s.codes.requests).toEqual([
      { kind: 'apartment', producerUserId: PRODUCER_ID, branchId: BRANCH_ID },
    ]);
    const [unit] = [...s.uow.properties.rows.values()];
    expect(unit).toMatchObject({
      code: 'DEP0001',
      status: 'draft',
      developmentId: DEVELOPMENT_ID,
      address: { street: 'Gurruchaga 1834', floor: '4', unit: 'A' },
      characteristics: { rooms: 3, surfaceTotalM2: 80, surfaceCoveredM2: 72 },
      operations: [expect.objectContaining({ currency: 'USD', priceCents: 15_000_000n })],
    });
    const actions = s.uow.audit.entries.map((entry) => [entry.action, entry.source]);
    expect(actions).toEqual([
      ['development.units_import_requested', 'gestion'],
      ['property.created', 'import'],
      ['development.unit_added', 'import'],
      ['development.units_imported', 'import'],
    ]);
    expect(s.uow.audit.entries[1]?.correlationId).toBe(job.id);
    expect(s.storage.objects.size).toBe(0);
  });

  it('updates the unit with the same floor and unit, and importing it again changes nothing', async () => {
    const s = setup();
    withUnit(s.uow, UNIT_4A, { floor: '4', unit: 'A' });
    const sheet = [
      row({ floor: '4°', unit: 'a', rooms: '2', saleCurrency: 'USD', salePrice: '130000' }),
    ];

    const first = await importRows(s, sheet);
    const second = await importRows(s, sheet);

    expect(first.totals).toMatchObject({ created: 0, updated: 1, failed: 0 });
    expect(second.totals).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(s.uow.properties.rows.size).toBe(1);
    expect(s.uow.properties.rows.get(UNIT_4A)).toMatchObject({
      characteristics: { rooms: 2 },
      operations: [expect.objectContaining({ priceCents: 13_000_000n })],
    });
    expect(s.uow.properties.priceChanges).toMatchObject([
      { propertyId: UNIT_4A, change: { oldPriceCents: 12_000_000n, newPriceCents: 13_000_000n } },
    ]);
    const updated = s.uow.audit.entries.find((entry) => entry.action === 'property.updated');
    expect(updated).toMatchObject({ entityId: UNIT_4A, source: 'import' });
    expect(updated?.changes).toMatchObject({
      rooms: { before: null, after: 2 },
      operations: {
        before: [expect.objectContaining({ priceCents: 12_000_000n })],
        after: [expect.objectContaining({ priceCents: 13_000_000n })],
      },
    });
  });

  it('keeps what an empty cell does not bring and adds a new operation', async () => {
    const s = setup();
    withUnit(s.uow, UNIT_4A, { floor: '4', unit: 'A' });
    const sheet = [...HEADERS, 'Alquiler: moneda', 'Alquiler: precio'];
    const bytes = s.reader.register('con-alquiler', [
      sheet,
      [...row({ floor: '4', unit: 'A' }), 'ARS', '900.000'],
    ]);
    const { importId } = unwrap(
      await s.start.execute(
        {
          developmentId: DEVELOPMENT_ID,
          fileName: 'u.xlsx',
          bytes,
          mapping: { ...MAPPING, rentCurrency: 10, rentPrice: 11 },
        },
        TEST_DEVELOPER,
      ),
    );
    unwrap(await s.run.execute({ importId }, JOB_ACTOR));

    expect(s.uow.properties.rows.get(UNIT_4A)?.operations).toEqual([
      expect.objectContaining({ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }),
      expect.objectContaining({ operation: 'rent', currency: 'ARS', priceCents: 90_000_000n }),
    ]);
  });

  it('changes the status as an explicit action, within the permissions of who imported', async () => {
    const s = setup();
    withUnit(s.uow, UNIT_4A, { floor: '4', unit: 'A' }, { status: 'available' });
    withUnit(s.uow, UNIT_5B, { floor: '5', unit: 'B' });

    const job = await importRows(s, [
      row({ floor: '4', unit: 'A', status: 'Vendida' }),
      row({ floor: '5', unit: 'B', status: 'Disponible' }),
    ]);

    expect(job.totals).toMatchObject({ updated: 1, failed: 1 });
    expect(s.uow.properties.rows.get(UNIT_4A)?.status).toBe('sold');
    expect(s.uow.properties.rows.get(UNIT_5B)?.status).toBe('draft');
    expect(
      s.uow.audit.entries.filter((entry) => entry.entityId === UNIT_4A).map((e) => e.action),
    ).toEqual(['property.status_changed']);
    expect(s.uow.unitImports.problems).toEqual([
      expect.objectContaining({ rowNumber: 3, code: 'status_forbidden', propertyId: UNIT_5B }),
    ]);
  });

  it('lets who can mark available make a unit available', async () => {
    const s = setup();
    withUnit(s.uow, UNIT_5B, { floor: '5', unit: 'B' });

    await importRows(
      s,
      [row({ floor: '5', unit: 'B', status: 'Disponible' })],
      TEST_DEVELOPMENTS_MANAGER,
    );

    expect(s.uow.properties.rows.get(UNIT_5B)?.status).toBe('available');
  });

  it('reports each row that cannot be imported, without stopping', async () => {
    const s = setup();
    withUnit(s.uow, UNIT_4A, { floor: '4', unit: 'A' });
    withUnit(s.uow, UNIT_5B, { floor: '4', unit: 'A' });
    withUnit(
      s.uow,
      '00000000-0000-7000-8000-0000000000c6',
      { floor: '6', unit: 'C' },
      { deletedAt: TEST_NOW, deletedBy: PRODUCER_ID },
    );

    const job = await importRows(s, [
      row({ floor: '4', unit: 'A', salePrice: '1' }),
      row({ floor: '6', unit: 'C', salePrice: '1' }),
      row({ floor: '7', unit: 'D', saleCurrency: 'USD' }),
      row({ floor: '7', unit: 'E', propertyType: 'Departamento' }),
      row({ floor: '7', unit: 'F', propertyType: 'Departamento', salePrice: '100' }),
      row({ floor: '7', saleCurrency: 'USD' }),
      row({
        floor: '7',
        unit: 'G',
        propertyType: 'Departamento',
        saleCurrency: 'USD',
        status: 'Reservada',
      }),
      row({ floor: '7', unit: 'H', propertyType: 'Departamento', saleCurrency: 'USD' }),
    ]);

    expect(job.totals).toMatchObject({ rows: 8, created: 1, failed: 7 });
    expect(s.uow.unitImports.problems.map((p) => [p.rowNumber, p.code, p.field])).toEqual([
      [2, 'ambiguous_unit', 'unit'],
      [3, 'unit_in_trash', 'unit'],
      [4, 'missing_type', 'propertyType'],
      [5, 'missing_operation', undefined],
      [6, 'missing_currency', 'saleCurrency'],
      [7, 'missing_unit', undefined],
      [8, 'invalid_status', 'status'],
    ]);
  });

  it('reports a new unit of a disabled type', async () => {
    const s = setup();
    s.uow.typeSettings.rows.set('garage', {
      kind: 'garage',
      isEnabled: false,
      visibleAttributes: [],
    });

    const job = await importRows(s, [
      row({ unit: 'C1', propertyType: 'Cochera', saleCurrency: 'USD' }),
    ]);

    expect(job.totals).toMatchObject({ created: 0, failed: 1 });
    expect(s.uow.unitImports.problems).toMatchObject([
      { code: 'type_disabled', field: 'propertyType' },
    ]);
    expect(s.codes.requests).toEqual([]);
  });

  it('reports the rows without a reference code', async () => {
    const s = setup({ codes: false });

    const job = await importRows(s, [
      row({ unit: 'A', propertyType: 'Departamento', saleCurrency: 'USD' }),
    ]);

    expect(job.totals).toMatchObject({ created: 0, failed: 1 });
    expect(s.uow.unitImports.problems).toEqual([
      expect.objectContaining({ code: 'code_unavailable' }),
    ]);
    expect(s.uow.properties.rows.size).toBe(0);
  });

  it('resumes after the last processed row and does nothing once finished', async () => {
    const s = setup();
    const bytes = s.reader.register('dos', [
      HEADERS,
      row({ unit: 'A', propertyType: 'Departamento', saleCurrency: 'USD' }),
      row({ unit: 'B', propertyType: 'Departamento', saleCurrency: 'USD' }),
    ]);
    const { importId } = unwrap(
      await s.start.execute(
        { developmentId: DEVELOPMENT_ID, fileName: 'u.xlsx', bytes, mapping: MAPPING },
        TEST_DEVELOPER,
      ),
    );
    const pending = s.uow.unitImports.rows.get(importId);
    if (!pending) throw new Error('The import was not stored');
    s.uow.unitImports.rows.set(importId, {
      ...pending,
      status: 'running',
      totals: { ...pending.totals, processed: 1, created: 1 },
    });

    unwrap(await s.run.execute({ importId }, JOB_ACTOR));
    unwrap(await s.run.execute({ importId }, JOB_ACTOR));

    expect(s.uow.unitImports.rows.get(importId)?.totals).toMatchObject({
      processed: 2,
      created: 2,
    });
    expect([...s.uow.properties.rows.values()].map((unit) => unit.address.unit)).toEqual(['B']);
  });

  it('fails when the development went to the trash', async () => {
    const s = setup();
    const bytes = s.reader.register('u', [HEADERS, row({ unit: 'A' })]);
    const { importId } = unwrap(
      await s.start.execute(
        { developmentId: DEVELOPMENT_ID, fileName: 'u.xlsx', bytes, mapping: MAPPING },
        TEST_DEVELOPER,
      ),
    );
    s.uow.developments.rows.set(
      DEVELOPMENT_ID,
      developmentSnapshot({ deletedAt: TEST_NOW, deletedBy: PRODUCER_ID }),
    );

    expect(unwrap(await s.run.execute({ importId }, JOB_ACTOR))).toEqual({ status: 'failed' });
    expect(s.uow.unitImports.rows.get(importId)?.failure).toBe('development_unavailable');
    expect(s.uow.audit.entries.at(-1)?.action).toBe('development.units_import_failed');
    expect(s.storage.objects.size).toBe(0);
  });

  it('fails when the stored file is gone or unreadable', async () => {
    const s = setup();
    const bytes = s.reader.register('u', [HEADERS, row({ unit: 'A' })]);
    const input = { developmentId: DEVELOPMENT_ID, fileName: 'u.xlsx', bytes, mapping: MAPPING };
    const missing = unwrap(await s.start.execute(input, TEST_DEVELOPER));
    s.storage.objects.clear();

    unwrap(await s.run.execute(missing, JOB_ACTOR));

    expect(s.uow.unitImports.rows.get(missing.importId)?.failure).toBe('file_missing');
  });

  it('runs only as the import job', async () => {
    const { run } = setup();

    expect(unwrapErr(await run.execute({ importId: 'x' }, TEST_DEVELOPER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await run.execute({ importId: 'x' }, JOB_ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(
      unwrapErr(await run.execute({ importId: '00000000-0000-7000-8000-0000000000ff' }, JOB_ACTOR)),
    ).toEqual({ type: 'DevelopmentUnitImportNotFound' });
  });
});

describe('import history', () => {
  it('lists the imports of the development with their problems', async () => {
    const s = setup();
    const job = await importRows(s, [row({ floor: '4' }), row({ unit: 'A' })]);

    const page = unwrap(await s.list.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER));
    expect(page.items).toMatchObject([
      {
        id: job.id,
        status: 'done',
        requestedBy: { id: PRODUCER_ID, name: 'Camila Ruiz' },
        totals: { failed: 2 },
      },
    ]);

    const problems = unwrap(
      await s.problems.execute({ developmentId: DEVELOPMENT_ID, importId: job.id }, TEST_DEVELOPER),
    );
    expect(problems.items.map((p) => [p.rowNumber, p.code])).toEqual([
      [2, 'missing_unit'],
      [3, 'missing_type'],
    ]);
  });

  it('hides the imports of another development and from who cannot import', async () => {
    const s = setup();
    const job = await importRows(s, [row({ floor: '4' })]);
    s.uow.developments.rows.set(OTHER_DEVELOPMENT, developmentSnapshot({ id: OTHER_DEVELOPMENT }));

    expect(
      unwrapErr(
        await s.problems.execute(
          { developmentId: OTHER_DEVELOPMENT, importId: job.id },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'DevelopmentUnitImportNotFound' });
    expect(
      unwrapErr(
        await s.get.execute({ developmentId: OTHER_DEVELOPMENT, importId: job.id }, TEST_DEVELOPER),
      ),
    ).toEqual({ type: 'DevelopmentUnitImportNotFound' });
    expect(
      unwrapErr(await s.list.execute({ developmentId: DEVELOPMENT_ID }, OTHER_BRANCH_EDITOR)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await s.get.execute({ developmentId: DEVELOPMENT_ID, importId: job.id }, TEST_OUTSIDER),
      ),
    ).toEqual({ type: 'Forbidden' });
  });

  it('gets one import with who asked for it', async () => {
    const s = setup();
    const job = await importRows(s, [row({ floor: '4' })]);

    expect(
      unwrap(
        await s.get.execute({ developmentId: DEVELOPMENT_ID, importId: job.id }, TEST_DEVELOPER),
      ),
    ).toMatchObject({
      id: job.id,
      fileName: 'unidades.xlsx',
      status: 'done',
      requestedBy: { id: PRODUCER_ID, name: 'Camila Ruiz' },
      totals: { rows: 1, failed: 1 },
    });
  });
});
