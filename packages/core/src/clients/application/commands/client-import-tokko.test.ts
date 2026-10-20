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
import { ClientTag } from '../../domain/client-tag';
import {
  AGENT_ID,
  BRANCH_ID,
  InMemoryClientAgents,
  InMemoryClientImportAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
} from '../../testing';
import { RunClientImport } from '../handlers/run-client-import';
import { PreviewClientImport } from '../queries/preview-client-import';

import { StartClientImport } from './start-client-import';

// La exportación de contactos de Tokko (`.xls`), con datos inventados.

const clock = new FixedClock('2026-10-20T12:00:00Z');
const ADMIN = Actor.user(AGENT_ID, [
  'clients:read',
  'clients:import',
  'clients:reassign',
  'tags:update',
]).withBranch(BRANCH_ID);
const JOB_ACTOR = Actor.system('import', ['clients:run-imports']);

const HEADERS = [
  'ID',
  'Nombre',
  'Teléfono',
  'Celular',
  'Fecha de nacimiento',
  'Correo electrónico',
  'Agente',
  'Etiquetas sin agrupar',
];
const MAPPING = {
  externalId: 0,
  name: 1,
  phone: 2,
  mobile: 3,
  birthDate: 4,
  email: 5,
  agent: 6,
  tags: 7,
};

type Row = readonly (string | undefined)[];

const ANA: Row = [
  '48213307',
  'Ana Pérez',
  '-',
  '5491166899124',
  '-',
  'ana@mail.com',
  'martin gomez',
  'Web | Venta | web',
];
const JUAN: Row = ['48213308', 'Juan Gómez', '011 4777-0000', '-', '-', '-', 'Nadie', 'Venta'];

function setup() {
  const uow = new InMemoryClientsUnitOfWork();
  const ids = new SequentialIdGenerator();
  const reader = new FakeSpreadsheetReader();
  const storage = new InMemoryFileStorage();
  const importAgents = new InMemoryClientImportAgents();
  return {
    uow,
    reader,
    importAgents,
    preview: new PreviewClientImport({ reader }),
    start: new StartClientImport({
      uow,
      reader,
      storage,
      agents: new InMemoryClientAgents(),
      ids,
      clock,
    }),
    run: new RunClientImport({ uow, reader, storage, agents: importAgents, ids, clock }),
  };
}

type Context = ReturnType<typeof setup>;

/** Pide y corre una importación con estas filas; devuelve su ID. */
async function importRows(ctx: Context, rows: readonly Row[]): Promise<string> {
  const bytes = ctx.reader.register('tokko', [HEADERS, ...rows]);
  const { importId } = unwrap(
    await ctx.start.execute({ fileName: 'Contactos.xls', bytes, mapping: MAPPING }, ADMIN),
  );
  unwrap(await ctx.run.execute({ importId }, JOB_ACTOR));
  return importId;
}

const clientNamed = (ctx: Context, name: string) =>
  [...ctx.uow.clients.rows.values()].find((c) => c.name === name);

describe('Tokko contacts import', () => {
  it('creates each contact with its Tokko ID, its agent by name and its tags', async () => {
    const ctx = setup();
    const importId = await importRows(ctx, [ANA, JUAN]);

    expect(ctx.uow.imports.rows.get(importId)).toMatchObject({
      status: 'done',
      totals: { rows: 2, processed: 2, created: 2, duplicates: 0, failed: 0 },
    });
    const ana = clientNamed(ctx, 'Ana Pérez');
    const juan = clientNamed(ctx, 'Juan Gómez');
    // Ana va con el agente de la planilla; Juan, con uno que no existe, queda con quien importa.
    expect(ana).toMatchObject({ agentId: OTHER_AGENT_ID, branchId: OTHER_BRANCH_ID });
    expect(juan).toMatchObject({ agentId: AGENT_ID, branchId: BRANCH_ID });
    expect(ana?.profile.birthDate).toBeUndefined();

    // "Web" se repetía en otra mayúscula; "Venta" se crea una sola vez y se usa en los dos.
    const tags = [...ctx.uow.tags.rows.values()];
    expect(tags.map((t) => [t.name, t.groupId])).toEqual([
      ['Web', undefined],
      ['Venta', undefined],
    ]);
    const tagId = (name: string) => tags.find((t) => t.name === name)?.id;
    expect(ana?.tagIds).toEqual([tagId('Web'), tagId('Venta')]);
    expect(juan?.tagIds).toEqual([tagId('Venta')]);

    expect([...ctx.uow.externalIds.rows]).toEqual([
      ['tokko:48213307', { clientId: ana?.id, erased: false }],
      ['tokko:48213308', { clientId: juan?.id, erased: false }],
    ]);
    // Un agente se busca una vez por corrida, aunque aparezca en muchas filas.
    expect(ctx.importAgents.searches).toEqual(['martin gomez', 'Nadie']);
  });

  it('audits the tags created and marked by the import, grouped by it', async () => {
    const ctx = setup();
    const importId = await importRows(ctx, [ANA]);
    const ana = clientNamed(ctx, 'Ana Pérez');

    const entries = ctx.uow.audit.entries.filter((e) => e.correlationId === importId);
    expect(entries.map((e) => e.action)).toEqual([
      'client.created',
      'client_tag.created',
      'client_tag.created',
      'client.tags_changed',
      'client_import.finished',
    ]);
    expect(entries.find((e) => e.action === 'client.tags_changed')).toMatchObject({
      actorId: 'system:import',
      entityId: ana?.id,
      clientIds: [ana?.id],
      changes: { tagIds: { before: [], after: [...(ana?.tagIds ?? [])].sort() } },
    });
  });

  it('reuses a loose tag with the same name', async () => {
    const ctx = setup();
    const web = ClientTag.create({
      id: unwrap(parseId<'ClientTag'>('00000000-0000-7000-8000-0000000000aa')),
      groupId: undefined,
      name: 'WEB',
      now: clock.now(),
    });
    await ctx.uow.tags.save(web);

    await importRows(ctx, [ANA]);

    expect(clientNamed(ctx, 'Ana Pérez')?.tagIds[0]).toBe(web.id);
    expect([...ctx.uow.tags.rows.values()].map((t) => t.name)).toEqual(['WEB', 'Venta']);
  });

  it('does not create again a contact imported before, even if it changed in Tokko', async () => {
    const ctx = setup();
    await importRows(ctx, [ANA, JUAN]);
    const ana = clientNamed(ctx, 'Ana Pérez');

    const second = await importRows(ctx, [
      [...ANA.slice(0, 3), '5491100000000', ...ANA.slice(4)],
      JUAN,
    ]);

    expect(ctx.uow.clients.rows.size).toBe(2);
    expect(ctx.uow.tags.rows.size).toBe(2);
    expect(ctx.uow.imports.rows.get(second)).toMatchObject({
      totals: { created: 0, duplicates: 2, failed: 0 },
    });
    expect(ctx.uow.imports.problems.filter((p) => p.importId === second)).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        code: 'already_imported',
        field: 'externalId',
        clientId: ana?.id,
      }),
      expect.objectContaining({ rowNumber: 3, code: 'already_imported' }),
    ]);
  });

  it('links the Tokko ID of a duplicate to the contact that already existed', async () => {
    const ctx = setup();
    const existing = await seedClient(ctx.uow, { name: 'Ana', emails: ['ana@mail.com'] });

    const first = await importRows(ctx, [ANA]);
    const second = await importRows(ctx, [ANA]);

    expect(ctx.uow.externalIds.rows.get('tokko:48213307')).toEqual({
      clientId: existing.id,
      erased: false,
    });
    expect(ctx.uow.imports.problems.map((p) => [p.importId, p.code, p.clientId])).toEqual([
      [first, 'duplicate', existing.id],
      [second, 'already_imported', existing.id],
    ]);
    // El duplicado no cambia: ni agente ni etiquetas de la planilla.
    expect(ctx.uow.clients.rows.get(existing.id)?.tagIds).toEqual([]);
  });

  it('does not create again a contact whose data was erased', async () => {
    const ctx = setup();
    ctx.uow.externalIds.rows.set('tokko:48213307', {
      clientId: '00000000-0000-7000-8000-0000000000ee',
      erased: true,
    });

    const importId = await importRows(ctx, [ANA]);

    expect(ctx.uow.clients.rows.size).toBe(0);
    expect(ctx.uow.imports.rows.get(importId)).toMatchObject({ totals: { failed: 1 } });
    expect(ctx.uow.imports.problems).toEqual([
      expect.objectContaining({ code: 'erased', field: 'externalId', clientId: undefined }),
    ]);
  });

  it('only suggests and accepts the agent and tag columns with their permissions', async () => {
    const ctx = setup();
    const bytes = ctx.reader.register('tokko', [HEADERS, ANA]);
    const importer = Actor.user(AGENT_ID, ['clients:read', 'clients:import']).withBranch(BRANCH_ID);

    const preview = unwrap(
      await ctx.preview.execute({ fileName: 'Contactos.xls', bytes }, importer),
    );
    expect(preview.suggestedMapping).toEqual({
      externalId: 0,
      name: 1,
      phone: 2,
      mobile: 3,
      birthDate: 4,
      email: 5,
    });
    expect(
      unwrap(await ctx.preview.execute({ fileName: 'Contactos.xls', bytes }, ADMIN))
        .suggestedMapping,
    ).toEqual(MAPPING);

    const { agent: _agent, ...withoutAgent } = MAPPING;
    const { tags: _tags, ...withoutTags } = MAPPING;
    const start = (mapping: Record<string, number>, actor: Actor) =>
      ctx.start.execute({ fileName: 'Contactos.xls', bytes, mapping }, actor);
    expect(unwrapErr(await start(withoutTags, importer))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await start(withoutAgent, importer))).toEqual({ type: 'Forbidden' });
    const { tags: _t, ...plain } = withoutAgent;
    unwrap(await start(plain, importer));
  });
});
