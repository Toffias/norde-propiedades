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
  closeReasonFixtureId,
  InMemoryClientAgents,
  InMemoryClientImportAgents,
  InMemoryClientsUnitOfWork,
  OTHER_AGENT_ID,
  OTHER_BRANCH_ID,
  seedClient,
  stageFixtureId,
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

  it('leaves without agent the contacts of the Tokko "Libre" and "Sin Asignar" pools', async () => {
    const ctx = setup();
    const LIBRE: Row = ['48213309', 'Pedro Libre', '-', '5491166899125', '-', '-', 'Libre', '-'];
    const SIN: Row = ['48213310', 'Rosa Sin', '-', '5491166899126', '-', '-', 'Sin Asignar', '-'];
    await importRows(ctx, [LIBRE, SIN]);

    expect(clientNamed(ctx, 'Pedro Libre')).toMatchObject({
      agentId: undefined,
      branchId: BRANCH_ID,
    });
    expect(clientNamed(ctx, 'Rosa Sin')).toMatchObject({ agentId: undefined, branchId: BRANCH_ID });
    // No se buscan como usuarios.
    expect(ctx.importAgents.searches).toEqual([]);
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

describe('Tokko opportunities import', () => {
  const OPP_HEADERS = [
    'ID',
    'Nombre',
    'Celular',
    'Fecha de creación',
    'Ultima actualización',
    'Estados de Oportunidades',
    'Motivo de cierre',
    'Origen',
    'Etiquetas sin agrupar',
  ];
  const OPP_MAPPING = {
    externalId: 0,
    name: 1,
    mobile: 2,
    createdDate: 3,
    updatedDate: 4,
    opportunityStatus: 5,
    closeReason: 6,
    origin: 7,
    tags: 8,
  };
  const MANAGER = Actor.user(AGENT_ID, [
    'clients:read',
    'clients:import',
    'tags:update',
    'opportunities:create',
    'settings:update',
  ]).withBranch(BRANCH_ID);

  async function importOpportunities(ctx: Context, rows: readonly Row[], actor = MANAGER) {
    const bytes = ctx.reader.register('tokko', [OPP_HEADERS, ...rows]);
    const started = await ctx.start.execute(
      { fileName: 'Contactos.xls', bytes, mapping: OPP_MAPPING },
      actor,
    );
    if (started.isErr()) return started;
    unwrap(await ctx.run.execute({ importId: started.value.importId }, JOB_ACTOR));
    return started;
  }

  const opportunityOf = (ctx: Context, name: string) => {
    const client = clientNamed(ctx, name);
    return [...ctx.uow.opportunities.rows.values()].find((o) => o.clientId === client?.id);
  };

  it('creates the opportunity of each contact in its state, with its reason, origin and dates', async () => {
    const ctx = setup();
    unwrap(
      await importOpportunities(ctx, [
        [
          '1',
          'Ana',
          '5491100000001',
          '01-02-2024',
          '10-03-2024',
          'Cerrado',
          'Alquilo con nosotros ()',
          'ZonaProp | mercadolibre',
          'Web',
        ],
        [
          '2',
          'Bruno',
          '5491100000002',
          '05-02-2024',
          '06-02-2024',
          'Cerrado',
          'Fantasma (nunca contestó)',
          '',
          'Venta',
        ],
        [
          '3',
          'Carla',
          '5491100000003',
          '07-02-2024',
          '07-02-2024',
          'Tomar Accion',
          '-',
          'icasas',
          'Tasacion',
        ],
      ]),
    );

    expect(opportunityOf(ctx, 'Ana')).toMatchObject({
      status: 'won',
      closeReasonId: closeReasonFixtureId(0),
      originChannel: 'zonaprop',
      type: 'rent',
      createdAt: new Date('2024-02-01T03:00:00Z'),
      closedAt: new Date('2024-03-10T03:00:00Z'),
      agentId: AGENT_ID,
      branchId: BRANCH_ID,
    });
    // "Fantasma" va a "No respondió", que no existía: se crea, negativo, una sola vez.
    const noAnswer = [...ctx.uow.closeReasons.rows.values()].find((r) => r.name === 'No respondió');
    expect(noAnswer).toMatchObject({ rating: 'negative', isActive: true });
    expect(opportunityOf(ctx, 'Bruno')).toMatchObject({
      status: 'lost',
      closeReasonId: noAnswer?.id,
      originChannel: 'office',
      type: 'sale',
      notes: [{ text: 'nunca contestó' }],
    });
    expect(opportunityOf(ctx, 'Carla')).toMatchObject({
      status: 'contacted',
      stageId: stageFixtureId(1),
      closeReasonId: undefined,
      closedAt: undefined,
      originChannel: 'icasas',
      type: 'appraisal',
    });
  });

  it('does not notify the team nor apply rules, and audits the import', async () => {
    const ctx = setup();
    const started = unwrap(
      await importOpportunities(ctx, [
        ['1', 'Ana', '5491100000001', '01-02-2024', '10-03-2024', 'Cerrado', 'Otro ()', '', ''],
      ]),
    );

    const types = ctx.uow.events.published.map((e) => e.type);
    expect(types).toContain('clients.opportunity_imported');
    expect(types).not.toContain('clients.opportunity_created');
    const opportunity = opportunityOf(ctx, 'Ana');
    const entries = ctx.uow.audit.entries.filter((e) => e.correlationId === started.importId);
    expect(entries.map((e) => e.action)).toEqual([
      'client.created',
      'opportunity_close_reason.created',
      'opportunity.imported',
      'client_import.finished',
    ]);
    expect(entries.find((e) => e.action === 'opportunity.imported')).toMatchObject({
      entityId: opportunity?.id,
      clientIds: [opportunity?.clientId],
      actorId: 'system:import',
    });
  });

  it('reports an unknown state or an invalid date without creating the contact', async () => {
    const ctx = setup();
    const started = unwrap(
      await importOpportunities(ctx, [
        ['1', 'Ana', '5491100000001', '01-02-2024', '10-03-2024', 'Archivado', '', '', ''],
        ['2', 'Bruno', '5491100000002', '31-02-2024', '', 'Cerrado', '', '', ''],
      ]),
    );

    expect(ctx.uow.clients.rows.size).toBe(0);
    expect(ctx.uow.imports.problems.filter((p) => p.importId === started.importId)).toEqual([
      expect.objectContaining({ rowNumber: 2, code: 'invalid_value', field: 'opportunityStatus' }),
      expect.objectContaining({ rowNumber: 3, code: 'invalid_value', field: 'createdDate' }),
    ]);
  });

  it('does not create an opportunity for a contact that already existed', async () => {
    const ctx = setup();
    await seedClient(ctx.uow, { name: 'Ana', phones: ['+5491100000001'] });

    unwrap(
      await importOpportunities(ctx, [
        ['1', 'Ana', '5491100000001', '01-02-2024', '10-03-2024', 'Cerrado', 'Fantasma ()', '', ''],
      ]),
    );

    expect(ctx.uow.opportunities.rows.size).toBe(0);
  });

  it('only suggests and accepts the opportunity column with opportunities:create and settings:update', async () => {
    const ctx = setup();
    const bytes = ctx.reader.register('tokko', [OPP_HEADERS, ['1', 'Ana', '5491100000001']]);
    const importer = Actor.user(AGENT_ID, ['clients:read', 'clients:import', 'tags:update']);

    const preview = await ctx.preview.execute({ fileName: 'x.xls', bytes }, importer);
    expect(unwrap(preview).suggestedMapping.opportunityStatus).toBeUndefined();
    expect(
      unwrapErr(await importOpportunities(ctx, [['1', 'Ana', '5491100000001']], importer)),
    ).toEqual({ type: 'Forbidden' });
  });
});
