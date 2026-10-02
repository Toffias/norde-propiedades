import {
  AddClientNote,
  ChangeOpportunityStage,
  CloseOpportunity,
  ListOpportunityHistory,
  ReassignOpportunity,
  RegisterContact,
  type OpportunityFilterCriteria,
  type OpportunityListCriteria,
  type OpportunityPipelineQuery,
} from '@norde/core/clients';
import { Actor, type Result } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { SEEDED_STAGES, useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import {
  auditLog,
  clientActivities,
  clientPhones,
  clients,
  clientTagAssignments,
  clientTags,
  opportunities,
  opportunityStatusChanges,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientListQuery } from './drizzle-client-list-query';
import { DrizzleClientRecordQuery } from './drizzle-client-record-query';
import { DrizzleOpportunityPipelineQuery } from './drizzle-opportunity-pipeline-query';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-01T10:00:00Z');
const ids = new UuidV7IdGenerator();
const pipeline = new DrizzleOpportunityPipelineQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const TAG = '00000000-0000-7000-8000-0000000000d1';
const NOW = new Date('2026-03-01T10:00:00Z');

const CLIENTS = 400;
const TOTAL = 2_000;
const STAGES = Object.values(SEEDED_STAGES);
const CATEGORIES = Object.keys(SEEDED_STAGES);
const CHANNELS = ['whatsapp', 'zonaprop', 'web_form', 'office'] as const;

function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (item === undefined) throw new Error('Empty list');
  return item;
}

const clientId = (i: number) => `00000000-0000-7000-8000-${(i + 1).toString().padStart(12, '0')}`;
const opportunityId = (i: number) =>
  `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`;

interface SeededOpportunity {
  readonly id: string;
  readonly client: number;
  readonly stage: string;
  readonly category: string;
  readonly agentId: string;
  readonly branchId: string | null;
  readonly channel: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const seeded: SeededOpportunity[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: opportunityId(i),
  client: i % CLIENTS,
  stage: pick(STAGES, i),
  category: pick(CATEGORIES, i),
  agentId: i % 3 === 0 ? AGENT : OTHER,
  branchId: i % 4 === 0 ? BRANCH : i % 4 === 1 ? OTHER_BRANCH : null,
  channel: pick(CHANNELS, i),
  createdAt: new Date(Date.UTC(2025, 0, 1) + i * 3_600_000),
  updatedAt: new Date(Date.UTC(2026, 0, 1) + ((i * 7919) % TOTAL) * 60_000),
}));

/** El contacto de la papelera: sus oportunidades no se listan. */
const isDeletedClient = (client: number) => client % 40 === 0;
const isTagged = (client: number) => client % 5 === 0;
const visible = seeded.filter((o) => !isDeletedClient(o.client));

/** 400 contactos y 2.000 oportunidades con una distribución conocida, insertados en SQL. */
async function seedPipeline(): Promise<void> {
  const clientRows = Array.from({ length: CLIENTS }, (_, i) => ({
    id: clientId(i),
    // "Contacto 00007" … para ordenar por nombre; los múltiplos de 7 se llaman "Búsqueda".
    name: i % 7 === 0 ? `Búsqueda ${i.toString()}` : `Contacto ${i.toString().padStart(5, '0')}`,
    kind: 'person',
    phoneE164: `+5411${(40_000_000 + i).toString()}`,
    phoneMatchKey: `+5411${(40_000_000 + i).toString()}`,
    clientTypes: i % 9 === 0 ? ['owner_seller'] : [],
    agentId: AGENT,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'system:import',
    updatedBy: 'system:import',
    deletedAt: isDeletedClient(i) ? NOW : null,
    deletedBy: isDeletedClient(i) ? OTHER : null,
  }));
  await db.insert(clients).values(clientRows);
  await db.insert(clientPhones).values(
    clientRows.map((row, i) => ({
      id: `00000000-0000-7000-a000-${(i + 1).toString().padStart(12, '0')}`,
      clientId: row.id,
      kind: 'mobile',
      phoneE164: `+54911${(50_000_000 + i).toString()}`,
      phoneMatchKey: `+5411${(50_000_000 + i).toString()}`,
      position: 0,
      createdAt: NOW,
      updatedAt: NOW,
      createdBy: 'system:import',
      updatedBy: 'system:import',
    })),
  );
  await db.insert(clientTags).values({
    id: TAG,
    name: 'Inversor',
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  });
  await db.insert(clientTagAssignments).values(
    clientRows
      .filter((_, i) => isTagged(i))
      .map((row) => ({
        clientId: row.id,
        tagId: TAG,
        createdAt: NOW,
        createdBy: 'system:import',
      })),
  );
  // Dos notas del primer contacto: vale la última.
  await db.insert(clientActivities).values(
    [
      { text: 'Primera nota', at: new Date('2026-02-01T10:00:00Z') },
      { text: 'Vuelve a llamar el lunes', at: new Date('2026-02-02T10:00:00Z') },
    ].map((note, i) => ({
      id: `00000000-0000-7000-b000-${(i + 1).toString().padStart(12, '0')}`,
      clientId: clientId(1),
      kind: 'note',
      actorId: AGENT,
      body: { text: note.text },
      occurredAt: note.at,
      createdAt: note.at,
      updatedAt: note.at,
      createdBy: AGENT,
      updatedBy: AGENT,
    })),
  );
  const rows = seeded.map((o) => ({
    id: o.id,
    clientId: clientId(o.client),
    originChannel: o.channel,
    type: 'sale',
    intent: 'info',
    status: o.category,
    stageId: o.stage,
    agentId: o.agentId,
    branchId: o.branchId,
    statusChangedAt: o.updatedAt,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  }));
  for (let start = 0; start < rows.length; start += 500) {
    await db.insert(opportunities).values(rows.slice(start, start + 500));
  }
  await db.execute(sql`analyze core.opportunities; analyze core.clients`);
}

const FILTER: OpportunityFilterCriteria = {
  visibility: { kind: 'all' },
  text: undefined,
  agentId: undefined,
  branchId: undefined,
  tagId: undefined,
  originChannel: undefined,
  category: undefined,
  created: { from: undefined, to: undefined },
  updated: { from: undefined, to: undefined },
};

const SECTION: OpportunityListCriteria = {
  ...FILTER,
  stageId: SEEDED_STAGES.new,
  sort: { field: 'updatedAt', direction: 'desc' },
  offset: 0,
  limit: 25,
};

const inNew = visible.filter((o) => o.stage === SEEDED_STAGES.new);

async function allIds(criteria: OpportunityListCriteria): Promise<string[]> {
  const found: string[] = [];
  for (let offset = 0; ; offset += criteria.limit) {
    const page = await pipeline.search({ ...criteria, offset });
    found.push(...page.items.map((item) => item.id));
    if (page.items.length < criteria.limit) return found;
  }
}

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

/** El plan de la página de una sección, con `enable_seqscan = off` (ver `clients-agenda`). */
async function pagePlan(criteria: OpportunityListCriteria): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    const query: OpportunityPipelineQuery = new DrizzleOpportunityPipelineQuery(logged);
    await query.search(criteria);
    const page = captured.find((q) => /\blimit\b/i.test(q.sql) && q.sql.includes('stage_id'));
    if (!page) throw new Error('No page query captured');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local enable_seqscan = off');
      const result = await client.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
        `explain (format json) ${page.sql}`,
        page.params,
      );
      await client.query('rollback');
      const [plan] = result.rows[0]?.['QUERY PLAN'] ?? [];
      if (!plan) throw new Error('No plan');
      return flatten(plan.Plan);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

describe('DrizzleOpportunityPipelineQuery', () => {
  it('pages a stage section without losing or repeating rows', async () => {
    await seedPipeline();

    const first = await pipeline.search(SECTION);
    expect(first.total).toBe(inNew.length);
    expect(first.items).toHaveLength(25);
    const updated = first.items.map((item) => item.updatedAt.getTime());
    expect(updated).toEqual([...updated].sort((a, b) => b - a));

    const all = await allIds(SECTION);
    expect(all).toHaveLength(inNew.length);
    expect(new Set(all).size).toBe(inNew.length);
    expect((await pipeline.search({ ...SECTION, offset: inNew.length })).items).toEqual([]);
  });

  it.each([
    ['createdAt', 'asc'],
    ['statusChangedAt', 'asc'],
    ['clientName', 'asc'],
    ['updatedAt', 'desc'],
  ] as const)('orders by %s %s in the database', async (field, direction) => {
    await seedPipeline();
    const criteria = { ...SECTION, sort: { field, direction } };

    const all = await allIds({ ...criteria, limit: 100 });
    expect(new Set(all).size).toBe(inNew.length);
    const page = await pipeline.search(criteria);
    if (field === 'clientName') {
      const names = page.items.map((item) => item.clientName?.toLowerCase() ?? '');
      expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    } else {
      const times = page.items.map((item) => item[field].getTime());
      const sign = direction === 'asc' ? 1 : -1;
      expect(times).toEqual([...times].sort((a, b) => sign * (a - b)));
    }
  });

  it('applies the visibility of the actor by the agent and branch of the opportunity', async () => {
    await seedPipeline();

    const own = await pipeline.search({
      ...SECTION,
      visibility: { kind: 'own', ownerId: AGENT },
    });
    expect(own.total).toBe(inNew.filter((o) => o.agentId === AGENT).length);
    const branch = await pipeline.search({
      ...SECTION,
      visibility: { kind: 'branch', ownerId: AGENT, branchId: BRANCH },
    });
    expect(branch.total).toBe(
      inNew.filter((o) => o.agentId === AGENT || o.branchId === BRANCH).length,
    );
    expect((await pipeline.search({ ...SECTION, visibility: { kind: 'none' } })).total).toBe(0);
  });

  it.each<[string, Partial<OpportunityFilterCriteria>, (o: SeededOpportunity) => boolean]>([
    ['agent', { agentId: OTHER }, (o) => o.agentId === OTHER],
    ['branch', { branchId: OTHER_BRANCH }, (o) => o.branchId === OTHER_BRANCH],
    ['channel', { originChannel: 'zonaprop' }, (o) => o.channel === 'zonaprop'],
    ['tag', { tagId: TAG }, (o) => isTagged(o.client)],
    ['text', { text: 'busqueda' }, (o) => o.client % 7 === 0],
    [
      'created range',
      { created: { from: new Date('2025-01-10T00:00:00Z'), to: new Date('2025-02-01T00:00:00Z') } },
      (o) =>
        o.createdAt >= new Date('2025-01-10T00:00:00Z') &&
        o.createdAt < new Date('2025-02-01T00:00:00Z'),
    ],
    [
      'updated range',
      { updated: { from: new Date('2026-01-01T12:00:00Z'), to: undefined } },
      (o) => o.updatedAt >= new Date('2026-01-01T12:00:00Z'),
    ],
  ])('filters by %s in SQL', async (_name, filter, expected) => {
    await seedPipeline();

    const page = await pipeline.search({ ...SECTION, ...filter });
    expect(page.total).toBe(inNew.filter(expected).length);
    expect(page.total).toBeGreaterThan(0);
  });

  it('counts by stage with the same filters, and the assigned new ones', async () => {
    await seedPipeline();

    const counts = await pipeline.countByStage({ ...FILTER, originChannel: 'whatsapp' });
    expect(new Map(counts.map((c) => [c.stageId, c.count]))).toEqual(
      new Map(
        STAGES.map(
          (stage) =>
            [
              stage,
              visible.filter((o) => o.stage === stage && o.channel === 'whatsapp').length,
            ] as const,
        ).filter(([, total]) => total !== 0),
      ),
    );
    expect(await pipeline.countByStage({ ...FILTER, category: 'won' })).toEqual([
      { stageId: SEEDED_STAGES.won, count: visible.filter((o) => o.category === 'won').length },
    ]);
    expect(await pipeline.countAssigned(AGENT, ['new'])).toBe(
      visible.filter((o) => o.agentId === AGENT && o.category === 'new').length,
    );
  });

  it('brings the mobile phone and the last note of each contact', async () => {
    await seedPipeline();

    // La oportunidad 1 es del contacto 1 y está en "Contactado".
    const page = await pipeline.search({
      ...SECTION,
      stageId: SEEDED_STAGES.contacted,
      text: 'contacto 00001',
      limit: 100,
    });
    const row = page.items.find((item) => item.clientId === clientId(1));
    expect(row).toMatchObject({
      clientName: 'Contacto 00001',
      clientPhone: '+5491150000001',
      lastNote: 'Vuelve a llamar el lunes',
      status: 'contacted',
      stageId: SEEDED_STAGES.contacted,
    });
  });

  it.each(['updatedAt', 'createdAt', 'statusChangedAt'] as const)(
    'resolves a section ordered by %s with an index on opportunities',
    async (field) => {
      await seedPipeline();

      const plan = await pagePlan({ ...SECTION, sort: { field, direction: 'desc' } });
      expect(
        plan.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'opportunities'),
      ).toBe(false);
    },
  );
});

describe('opportunity actions persistence', () => {
  const uow = createClientsUnitOfWork(db, { ids, clock });
  const system = Actor.system('agent-ia', ['clients:create']);
  const manager = Actor.user(AGENT, ['opportunities:*']).withBranch(BRANCH);

  function unwrap<T, E>(result: Result<T, E>): T {
    if (result.isErr()) throw new Error(JSON.stringify(result.error));
    return result.value;
  }

  async function registerAna() {
    return unwrap(
      await new RegisterContact({ uow, ids, clock }).execute(
        {
          channel: 'whatsapp',
          channelExternalId: '5491166899124',
          phone: '+5491166899124',
          name: 'Ana',
          opportunity: { type: 'rent', intent: 'visit' },
        },
        system,
      ),
    );
  }

  it('changes the stage, closes and reassigns with history, activity and audit', async () => {
    const { opportunityId, clientId: anaId } = await registerAna();
    const agents = {
      names: () => Promise.resolve(new Map<string, string>()),
      find: () => Promise.resolve({ branchId: OTHER_BRANCH }),
    };

    unwrap(
      await new ChangeOpportunityStage({ uow, ids, clock }).execute(
        { opportunityId, stageId: SEEDED_STAGES.contacted },
        manager,
      ),
    );
    unwrap(
      await new ReassignOpportunity({ uow, agents, clock }).execute(
        { opportunityId, agentId: OTHER },
        manager,
      ),
    );
    // La tarjeta de la ficha muestra el estado editable y el agente de la oportunidad.
    expect(
      await new DrizzleClientRecordQuery(db).activeOpportunity(anaId, ['new', 'contacted']),
    ).toMatchObject({
      id: opportunityId,
      stage: { id: SEEDED_STAGES.contacted, name: 'contacted', color: '#64748b' },
      agentId: OTHER,
      branchId: OTHER_BRANCH,
    });

    const reasonId = '01920000-0000-7000-8000-000000000201';
    await db.execute(sql`
      insert into core.opportunity_close_reasons
        (id, name, rating, position, is_active, created_at, updated_at, created_by, updated_by)
      values (${reasonId}, 'Dejó de buscar', 'negative', 0, true, now(), now(),
        'system:import', 'system:import')`);
    unwrap(
      await new CloseOpportunity({ uow, ids, clock }).execute(
        { opportunityId, closeReasonId: reasonId },
        manager,
      ),
    );

    const [row] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
    expect(row).toMatchObject({
      status: 'lost',
      stageId: SEEDED_STAGES.lost,
      agentId: OTHER,
      branchId: OTHER_BRANCH,
      closedAt: clock.now(),
      updatedBy: AGENT,
    });
    const changes = await db
      .select({ to: opportunityStatusChanges.toStatus, by: opportunityStatusChanges.changedBy })
      .from(opportunityStatusChanges)
      .where(eq(opportunityStatusChanges.opportunityId, opportunityId))
      .orderBy(opportunityStatusChanges.id);
    expect(changes).toEqual([
      { to: 'new', by: 'system:agent-ia' },
      { to: 'contacted', by: AGENT },
      { to: 'lost', by: AGENT },
    ]);
    const activity = await db
      .select({ kind: clientActivities.kind, body: clientActivities.body })
      .from(clientActivities)
      .where(eq(clientActivities.opportunityId, opportunityId))
      .orderBy(clientActivities.id);
    expect(activity.filter((a) => a.kind === 'status_change').map((a) => a.body)).toEqual([
      {
        from: 'new',
        to: 'contacted',
        fromStageId: SEEDED_STAGES.new,
        toStageId: SEEDED_STAGES.contacted,
      },
      {
        from: 'contacted',
        to: 'lost',
        fromStageId: SEEDED_STAGES.contacted,
        toStageId: SEEDED_STAGES.lost,
      },
    ]);
    const audit = await db
      .select({ action: auditLog.action, clientIds: auditLog.clientIds })
      .from(auditLog)
      .where(eq(auditLog.entityId, opportunityId))
      .orderBy(auditLog.id);
    expect(audit.map((a) => a.action)).toEqual([
      'opportunity.opened',
      'opportunity.status_changed',
      'opportunity.reassigned',
      'opportunity.closed',
    ]);
    expect(audit.every((a) => a.clientIds.includes(anaId))).toBe(true);
  });

  it('keeps the history of an opportunity: its notes and stage changes, by kind', async () => {
    const { opportunityId, clientId: anaId } = await registerAna();
    const records = new DrizzleClientRecordQuery(db);
    const agents = {
      names: () => Promise.resolve(new Map([[AGENT, 'Camila']])),
      find: () => Promise.resolve(undefined),
    };
    const writer = Actor.user(AGENT, ['opportunities:*', 'clients:*']).withBranch(BRANCH);

    unwrap(
      await new ChangeOpportunityStage({ uow, ids, clock }).execute(
        { opportunityId, stageId: SEEDED_STAGES.contacted },
        manager,
      ),
    );
    const notes = new AddClientNote({ uow, ids, clock });
    unwrap(
      await notes.execute(
        { clientId: anaId, opportunityId, text: 'Pidió visita el sábado' },
        writer,
      ),
    );
    // Una nota del contacto, sin oportunidad: no va al historial de la oportunidad.
    unwrap(await notes.execute({ clientId: anaId, text: 'Cambió de número' }, writer));

    const history = new ListOpportunityHistory({ uow, records, agents });
    const page = unwrap(await history.execute({ opportunityId }, manager));
    expect(page.items.map((item) => item.kind)).toEqual(['note', 'status_change']);
    expect(page.items[0]).toMatchObject({
      text: 'Pidió visita el sábado',
      actor: { kind: 'user', name: 'Camila' },
    });
    expect(page.items[1]).toMatchObject({
      from: 'new',
      to: 'contacted',
      fromStage: { id: SEEDED_STAGES.new, name: 'new' },
      toStage: { id: SEEDED_STAGES.contacted, name: 'contacted' },
    });

    const changes = unwrap(
      await history.execute({ opportunityId, kind: 'status_change' }, manager),
    );
    expect(changes.total).toBe(1);
    // La nota del contacto sigue en su timeline.
    const timeline = await records.activity({
      clientId: anaId,
      kind: 'note',
      direction: 'desc',
      offset: 0,
      limit: 10,
    });
    expect(timeline.total).toBe(2);
  });

  it('filters contacts by the stage of their opportunities', async () => {
    const { clientId: anaId } = await registerAna();
    const list = new DrizzleClientListQuery(db);
    const base = {
      view: 'active' as const,
      visibility: { kind: 'all' as const },
      text: undefined,
      agentId: undefined,
      branchId: undefined,
      kind: undefined,
      clientType: undefined,
      tagged: undefined,
      tagId: undefined,
      letter: undefined,
      anyOfTypes: undefined,
      created: { from: undefined, to: undefined },
      updated: { from: undefined, to: undefined },
    };

    expect(await list.count({ ...base, opportunityStageId: SEEDED_STAGES.new })).toBe(1);
    expect(await list.count({ ...base, opportunityStageId: SEEDED_STAGES.won })).toBe(0);
    const page = await list.search({
      ...base,
      opportunityStageId: SEEDED_STAGES.new,
      sort: { field: 'name', direction: 'asc' },
      offset: 0,
      limit: 25,
    });
    expect(page.items.map((item) => item.id)).toEqual([anaId]);
  });
});
