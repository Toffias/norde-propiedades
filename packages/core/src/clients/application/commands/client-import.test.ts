import { describe, expect, it } from 'vitest';

import { InMemoryFileStorage } from '../../../settings/testing';
import { Actor } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  AGENT_ID,
  BRANCH_ID,
  FakeSpreadsheetReader,
  InMemoryClientAgents,
  InMemoryClientImportQuery,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
} from '../../testing';
import { RunClientImport } from '../handlers/run-client-import';
import { GetClientImport } from '../queries/get-client-import';
import { ListClientImportProblems } from '../queries/list-client-import-problems';
import { ListClientImports } from '../queries/list-client-imports';
import { PreviewClientImport } from '../queries/preview-client-import';

import { StartClientImport } from './start-client-import';

const clock = new FixedClock('2026-10-02T12:00:00Z');
/** Agente que importa contactos a su nombre. */
const IMPORTER = Actor.user(AGENT_ID, ['clients:read', 'clients:import'])
  .withBranch(BRANCH_ID)
  .withCorrelation('req-1');
const JOB_ACTOR = Actor.system('import', ['clients:run-imports']);

const HEADERS = ['Nombre', 'Celular', 'Email', 'Tipos de cliente'];
const MAPPING = { name: 0, mobile: 1, email: 2, clientTypes: 3 };

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const ids = new SequentialIdGenerator();
  const reader = new FakeSpreadsheetReader();
  const storage = new InMemoryFileStorage();
  const agents = new InMemoryClientAgents();
  const query = new InMemoryClientImportQuery(uow.imports);
  return {
    uow,
    reader,
    storage,
    preview: new PreviewClientImport({ reader }),
    start: new StartClientImport({ uow, reader, storage, agents, ids, clock }),
    run: new RunClientImport({ uow, reader, storage, ids, clock }),
    list: new ListClientImports({ imports: query, agents }),
    get: new GetClientImport({ imports: query, agents }),
    problems: new ListClientImportProblems({ imports: query }),
  };
}

describe('PreviewClientImport', () => {
  it('reads the headers, a sample and the row count, and suggests the mapping', async () => {
    const { reader, preview } = setup();
    const bytes = reader.register('contactos', [
      HEADERS,
      ['Ana Pérez', '+5491166899124', 'ana@mail.com', 'Comprador'],
      ['Juan Gómez', undefined, 'juan@mail.com', undefined],
    ]);

    const result = unwrap(await preview.execute({ fileName: 'contactos.xlsx', bytes }, IMPORTER));

    expect(result).toEqual({
      headers: HEADERS,
      sample: [
        ['Ana Pérez', '+5491166899124', 'ana@mail.com', 'Comprador'],
        ['Juan Gómez', null, 'juan@mail.com', null],
      ],
      rowCount: 2,
      suggestedMapping: MAPPING,
    });
  });

  it('rejects a file that is not an Excel or has no rows', async () => {
    const { reader, preview } = setup();
    const empty = reader.register('vacio', [HEADERS]);

    expect(
      unwrapErr(
        await preview.execute(
          { fileName: 'x.xlsx', bytes: new TextEncoder().encode('no es un excel') },
          IMPORTER,
        ),
      ),
    ).toEqual({ type: 'UnreadableSpreadsheet' });
    expect(
      unwrapErr(await preview.execute({ fileName: 'x.xlsx', bytes: empty }, IMPORTER)),
    ).toEqual({ type: 'EmptyImportFile' });
    expect(
      unwrapErr(await preview.execute({ fileName: 'x.xlsx', bytes: new Uint8Array() }, IMPORTER))
        .type,
    ).toBe('InvalidInput');
  });

  it('requires clients:import', async () => {
    const { reader, preview } = setup();
    const bytes = reader.register('contactos', [HEADERS, ['Ana', undefined, 'a@b.com']]);

    expect(
      unwrapErr(
        await preview.execute(
          { fileName: 'x.xlsx', bytes },
          Actor.user(AGENT_ID, ['clients:create']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('StartClientImport', () => {
  it('stores the file, leaves the import pending for the job and audits it', async () => {
    const { uow, reader, storage, start } = setup();
    const bytes = reader.register('contactos', [HEADERS, ['Ana', undefined, 'a@b.com']]);

    const { importId } = unwrap(
      await start.execute({ fileName: 'contactos.xlsx', bytes, mapping: MAPPING }, IMPORTER),
    );

    expect(uow.imports.rows.get(importId)).toMatchObject({
      status: 'pending',
      fileName: 'contactos.xlsx',
      storageKey: `imports/clients/${importId}`,
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
      totals: { rows: 1, processed: 0 },
      requestedBy: AGENT_ID,
    });
    expect(storage.objects.has(`imports/clients/${importId}`)).toBe(true);
    expect(uow.events.published).toEqual([
      expect.objectContaining({ type: 'clients.import_requested', payload: { importId } }),
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'client_import.requested',
        entityType: 'client_import',
        entityId: importId,
        clientIds: [],
        changes: {
          fileName: { before: null, after: 'contactos.xlsx' },
          rows: { before: null, after: 1 },
          agentId: { before: null, after: AGENT_ID },
          mapping: { before: null, after: MAPPING },
        },
      }),
    ]);
  });

  it('rejects a mapping without a name or contact column, and does not store the file', async () => {
    const { uow, reader, storage, start } = setup();
    const bytes = reader.register('contactos', [HEADERS, ['Ana', undefined, 'a@b.com']]);

    expect(
      unwrapErr(await start.execute({ fileName: 'x.xlsx', bytes, mapping: { name: 0 } }, IMPORTER)),
    ).toEqual({ type: 'InvalidImportMapping', reason: 'missing_contact' });
    expect(
      unwrapErr(
        await start.execute(
          { fileName: 'x.xlsx', bytes, mapping: { name: 0, email: 9 } },
          IMPORTER,
        ),
      ),
    ).toEqual({ type: 'InvalidImportMapping', reason: 'unknown_column' });
    expect(uow.imports.rows.size).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('assigns the contacts to another agent only with clients:reassign', async () => {
    const { uow, reader, start } = setup();
    const bytes = reader.register('contactos', [HEADERS, ['Ana', undefined, 'a@b.com']]);
    const input = { fileName: 'x.xlsx', bytes, mapping: MAPPING, agentId: OTHER_AGENT_ID };

    expect(unwrapErr(await start.execute(input, IMPORTER))).toEqual({ type: 'Forbidden' });
    const manager = Actor.user(AGENT_ID, ['clients:import', 'clients:reassign']);
    const { importId } = unwrap(await start.execute(input, manager));
    expect(uow.imports.rows.get(importId)).toMatchObject({
      agentId: OTHER_AGENT_ID,
      branchId: OTHER_BRANCH_ID,
    });
    expect(
      unwrapErr(
        await start.execute({ ...input, agentId: '00000000-0000-7000-8000-0000000000ff' }, manager),
      ),
    ).toEqual({ type: 'AgentNotFound' });
  });

  it('requires clients:import', async () => {
    const { reader, start } = setup();
    const bytes = reader.register('contactos', [HEADERS, ['Ana', undefined, 'a@b.com']]);

    expect(
      unwrapErr(
        await start.execute(
          { fileName: 'x.xlsx', bytes, mapping: MAPPING },
          Actor.user(AGENT_ID, ['clients:create']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('RunClientImport', () => {
  async function started(rows: readonly (readonly (string | undefined)[])[]) {
    const ctx = setup();
    const bytes = ctx.reader.register('contactos', [HEADERS, ...rows]);
    const { importId } = unwrap(
      await ctx.start.execute({ fileName: 'contactos.xlsx', bytes, mapping: MAPPING }, IMPORTER),
    );
    ctx.uow.events.published.splice(0);
    ctx.uow.audit.entries.splice(0);
    return { ...ctx, importId };
  }

  it('creates each row with the duplicate rule and records the rows that were not imported', async () => {
    const ctx = await started([
      ['Ana Pérez', '+5491166899124', 'ana@mail.com', 'Comprador'],
      ['Ana otra vez', undefined, 'ANA@mail.com', undefined],
      ['Sin datos', undefined, undefined, undefined],
      ['Juan Gómez', '123', undefined, undefined],
    ]);
    const existing = await seedClient(ctx.uow, { name: 'Existente', phones: ['+541147770000'] });
    ctx.reader.register('contactos', [
      HEADERS,
      ['Ana Pérez', '+5491166899124', 'ana@mail.com', 'Comprador'],
      ['Ana otra vez', undefined, 'ANA@mail.com', undefined],
      ['Sin datos', undefined, undefined, undefined],
      ['Juan Gómez', '123', undefined, undefined],
      ['Existente', '+54 11 4777-0000', undefined, undefined],
    ]);

    expect(unwrap(await ctx.run.execute({ importId: ctx.importId }, JOB_ACTOR))).toEqual({
      status: 'done',
    });

    const job = ctx.uow.imports.rows.get(ctx.importId);
    expect(job).toMatchObject({
      status: 'done',
      totals: { rows: 5, processed: 5, created: 1, duplicates: 2, failed: 2 },
    });
    const created = [...ctx.uow.clients.rows.values()].filter((c) => c.name === 'Ana Pérez');
    expect(created).toMatchObject([
      { agentId: AGENT_ID, branchId: BRANCH_ID, clientTypes: ['buyer'] },
    ]);
    const anaId = created[0]?.id;
    expect(ctx.uow.clients.savedBy.get(anaId ?? '')).toBe('system:import');
    expect(ctx.uow.imports.problems).toEqual([
      {
        importId: ctx.importId,
        rowNumber: 3,
        code: 'duplicate',
        field: undefined,
        clientId: anaId,
      },
      {
        importId: ctx.importId,
        rowNumber: 4,
        code: 'missing_contact',
        field: undefined,
        clientId: undefined,
      },
      {
        importId: ctx.importId,
        rowNumber: 5,
        code: 'invalid_phone',
        field: 'mobile',
        clientId: undefined,
      },
      {
        importId: ctx.importId,
        rowNumber: 6,
        code: 'duplicate',
        field: undefined,
        clientId: existing.id,
      },
    ]);
    // El alta queda auditada como importación, agrupada por la importación; el archivo se borra.
    expect(ctx.uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'created',
        action: 'client.created',
        actorId: 'system:import',
        source: 'import',
        correlationId: ctx.importId,
        clientIds: [anaId],
      }),
      expect.objectContaining({
        action: 'client_import.finished',
        entityId: ctx.importId,
        changes: {
          status: { before: 'running', after: 'done' },
          created: { before: null, after: 1 },
          duplicates: { before: null, after: 2 },
          failed: { before: null, after: 2 },
        },
      }),
    ]);
    expect(ctx.storage.objects.size).toBe(0);
  });

  it('does nothing when the event arrives again for a finished import', async () => {
    const ctx = await started([['Ana Pérez', '+5491166899124', undefined, undefined]]);
    unwrap(await ctx.run.execute({ importId: ctx.importId }, JOB_ACTOR));
    const audited = ctx.uow.audit.entries.length;

    expect(unwrap(await ctx.run.execute({ importId: ctx.importId }, JOB_ACTOR))).toEqual({
      status: 'done',
    });
    expect(ctx.uow.audit.entries).toHaveLength(audited);
    expect(ctx.uow.clients.rows.size).toBe(1);
  });

  it('resumes from the last processed row after a cut', async () => {
    const ctx = await started([
      ['Ana Pérez', '+5491166899124', undefined, undefined],
      ['Juan Gómez', '+5491155550000', undefined, undefined],
    ]);
    const snapshot = ctx.uow.imports.rows.get(ctx.importId);
    if (!snapshot) throw new Error('Missing import');
    // El job anterior procesó la primera fila y se cortó.
    ctx.uow.imports.rows.set(ctx.importId, {
      ...snapshot,
      status: 'running',
      totals: { ...snapshot.totals, processed: 1, created: 1 },
    });

    unwrap(await ctx.run.execute({ importId: ctx.importId }, JOB_ACTOR));

    expect([...ctx.uow.clients.rows.values()].map((c) => c.name)).toEqual(['Juan Gómez']);
    expect(ctx.uow.imports.rows.get(ctx.importId)?.totals).toMatchObject({
      processed: 2,
      created: 2,
    });
  });

  it('fails the import when the file is gone or cannot be read', async () => {
    const ctx = await started([['Ana', undefined, 'a@b.com', undefined]]);
    ctx.storage.objects.clear();

    unwrap(await ctx.run.execute({ importId: ctx.importId }, JOB_ACTOR));

    expect(ctx.uow.imports.rows.get(ctx.importId)).toMatchObject({
      status: 'failed',
      failure: 'file_missing',
    });
    expect(ctx.uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'client_import.failed',
        changes: {
          status: { before: 'running', after: 'failed' },
          failure: { before: null, after: 'file_missing' },
        },
      }),
    ]);

    const unreadable = await started([['Ana', undefined, 'a@b.com', undefined]]);
    const key = unreadable.uow.imports.rows.get(unreadable.importId)?.storageKey ?? '';
    await unreadable.storage.put({
      key,
      contentType: 'application/octet-stream',
      bytes: new TextEncoder().encode('roto'),
    });
    unwrap(await unreadable.run.execute({ importId: unreadable.importId }, JOB_ACTOR));
    expect(unreadable.uow.imports.rows.get(unreadable.importId)?.failure).toBe('unreadable_file');
  });

  it('reports a missing import, an invalid id and an actor without the permission', async () => {
    const ctx = await started([['Ana', undefined, 'a@b.com', undefined]]);

    expect(
      unwrapErr(
        await ctx.run.execute({ importId: '00000000-0000-7000-8000-0000000000ff' }, JOB_ACTOR),
      ),
    ).toEqual({ type: 'ClientImportNotFound' });
    expect(unwrapErr(await ctx.run.execute({ importId: 'x' }, JOB_ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(unwrapErr(await ctx.run.execute({ importId: ctx.importId }, IMPORTER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('import history', () => {
  it('lists the imports with who asked, their totals and the rows that were not imported', async () => {
    const ctx = setup();
    const bytes = ctx.reader.register('contactos', [
      HEADERS,
      ['Ana', undefined, 'a@b.com', undefined],
      ['Sin datos', undefined, undefined, undefined],
    ]);
    const { importId } = unwrap(
      await ctx.start.execute({ fileName: 'contactos.xlsx', bytes, mapping: MAPPING }, IMPORTER),
    );
    unwrap(await ctx.run.execute({ importId }, JOB_ACTOR));

    const page = unwrap(await ctx.list.execute({}, IMPORTER));
    expect(page).toMatchObject({ total: 1, page: 1 });
    expect(page.items).toEqual([
      {
        id: importId,
        fileName: 'contactos.xlsx',
        status: 'done',
        totals: { rows: 2, processed: 2, created: 1, duplicates: 0, failed: 1 },
        failure: undefined,
        requestedBy: { id: AGENT_ID, name: 'Camila' },
        agent: { id: AGENT_ID, name: 'Camila' },
        createdAt: clock.now(),
        startedAt: clock.now(),
        finishedAt: clock.now(),
      },
    ]);
    expect(unwrap(await ctx.get.execute({ importId }, IMPORTER)).status).toBe('done');

    const problems = unwrap(await ctx.problems.execute({ importId }, IMPORTER));
    expect(problems.items).toEqual([
      { rowNumber: 3, code: 'missing_contact', field: undefined, clientId: undefined },
    ]);
  });

  it('requires clients:import and reports a missing import', async () => {
    const { list, get, problems } = setup();
    const outsider = Actor.user(AGENT_ID, ['clients:read']);
    const importId = '00000000-0000-7000-8000-0000000000ff';

    expect(unwrapErr(await list.execute({}, outsider))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await get.execute({ importId }, outsider))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await problems.execute({ importId }, outsider))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await get.execute({ importId }, IMPORTER))).toEqual({
      type: 'ClientImportNotFound',
    });
  });
});
