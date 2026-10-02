import {
  AddClientNote,
  Client,
  FeatureProperties,
  RecordClientActivity,
  UnfeatureProperty,
  type ClientListingSummary,
  type ClientRecordQuery,
} from '@norde/core/clients';
import { Actor, parseId, Phone } from '@norde/core/shared';
import { FixedClock } from '@norde/core/shared/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import {
  clientActivities,
  clientRelations,
  clients,
  featuredListings,
  opportunities,
  savedSearches,
} from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { createClientsUnitOfWork } from './clients-unit-of-work';
import { DrizzleClientRecordQuery } from './drizzle-client-record-query';
import { DrizzleClientRepository } from './drizzle-client-repositories';

const db = useTestDatabase();
const clock = new FixedClock('2026-03-10T12:00:00Z');
const ids = new UuidV7IdGenerator();
const uow = createClientsUnitOfWork(db, { ids, clock });
const repository = new DrizzleClientRepository(db, ids);
const records = new DrizzleClientRecordQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const PROPERTY = '00000000-0000-7000-8000-0000000000e1';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000e2';
const NOW = new Date('2026-03-10T12:00:00Z');
const authored = { createdBy: 'system:import', updatedBy: 'system:import' };

const manager = Actor.user(AGENT, ['clients:*', 'properties:read']).withBranch(BRANCH);
const jobs = Actor.system('scheduler', ['clients:record-activity']);

function listing(id: string): ClientListingSummary {
  return {
    id,
    code: id.slice(-3),
    title: 'Departamento',
    address: undefined,
    status: 'available',
    operations: [],
    coverImageUrl: undefined,
  };
}

const listings = {
  summaries: (propertyIds: readonly string[]) =>
    Promise.resolve(new Map(propertyIds.map((id) => [id, listing(id)] as const))),
};

async function seedClient(name: string, phone: string): Promise<string> {
  const id = parseId<'Client'>(ids.next());
  const parsedPhone = Phone.create(phone);
  if (id.isErr() || parsedPhone.isErr()) throw new Error('invalid fixture');
  const created = Client.create({
    id: id.value,
    kind: 'person',
    name,
    phones: [{ kind: 'mobile', phone: parsedPhone.value, contactHours: undefined }],
    emails: [],
    clientTypes: [],
    agentId: AGENT,
    branchId: BRANCH,
    profile: {},
    now: NOW,
  });
  if (created.isErr()) throw new Error(created.error.type);
  await repository.save(created.value, AGENT);
  return id.value;
}

const ACTIVITY_TOTAL = 1_200;

/** 1.200 entradas de un contacto (una de cada tres, nota) y 3.000 de otros, por volumen. */
async function seedActivity(clientId: string, others: readonly string[]): Promise<void> {
  const rows = [
    ...Array.from({ length: ACTIVITY_TOTAL }, (_, i) => ({
      id: `00000000-0000-7000-8000-${(i + 1).toString().padStart(12, '0')}`,
      clientId,
      kind: i % 3 === 0 ? 'note' : 'merge',
      actorId: AGENT,
      body: i % 3 === 0 ? { text: `Nota ${i}` } : { mergedClientId: AGENT },
      // Algunas en el mismo instante: el ID desempata.
      occurredAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 60_000),
      createdAt: NOW,
      updatedAt: NOW,
      ...authored,
    })),
    ...Array.from({ length: 3_000 }, (_, i) => ({
      id: `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`,
      clientId: others[i % others.length] ?? clientId,
      kind: 'note',
      actorId: AGENT,
      body: { text: 'otra' },
      occurredAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000),
      createdAt: NOW,
      updatedAt: NOW,
      ...authored,
    })),
  ];
  for (let start = 0; start < rows.length; start += 500) {
    await db.insert(clientActivities).values(rows.slice(start, start + 500));
  }
  await db.execute(sql`analyze core.client_activities`);
}

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

/**
 * El plan de la página que pide `run`, con `enable_seqscan = off`: Postgres solo recorre la tabla
 * entera si no tiene un índice que resuelva el filtro y el orden.
 */
async function pagePlan(run: (query: ClientRecordQuery) => Promise<unknown>): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await run(new DrizzleClientRecordQuery(logged));
    const page = captured.find((q) => /\blimit\b/i.test(q.sql) && !/count\(/i.test(q.sql));
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

function scansWithIndex(nodes: readonly PlanNode[], table: string): boolean {
  return !nodes.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === table);
}

describe('client activity', () => {
  it('adds a note through the use case and lists it with the events of the timeline', async () => {
    const clientId = await seedClient('Ana', '+5491166899124');

    const note = await new AddClientNote({ uow, ids, clock }).execute(
      { clientId, text: 'Vuelve a llamar el lunes' },
      manager,
    );
    if (note.isErr()) throw new Error(note.error.type);

    const handler = new RecordClientActivity({ uow });
    const event = {
      id: ids.next(),
      type: 'conversations.conversation_linked_to_client' as const,
      occurredAt: new Date('2026-03-11T12:00:00Z'),
      payload: { conversationId: 'conv-1', clientId, channel: 'whatsapp' },
    };
    const first = await handler.execute(event, jobs);
    const again = await handler.execute(event, jobs);

    expect(first.isOk() && first.value).toEqual({ recorded: true });
    expect(again.isOk() && again.value).toEqual({ recorded: false });
    const page = await records.activity({
      clientId,
      kind: undefined,
      direction: 'desc',
      offset: 0,
      limit: 10,
    });
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.actorId, item.body])).toEqual([
      ['system:agent-ia', { kind: 'message', conversationId: 'conv-1', channel: 'whatsapp' }],
      [AGENT, { kind: 'note', text: 'Vuelve a llamar el lunes' }],
    ]);
  });

  it('pages 1.200 entries with LIMIT, without losing or repeating rows, also by kind', async () => {
    const clientId = await seedClient('Ana', '+5491166899124');
    const others = [
      await seedClient('Beto', '+5491166899125'),
      await seedClient('Caro', '+5491166899126'),
    ];
    await seedActivity(clientId, others);

    const seen: string[] = [];
    for (let offset = 0; offset < ACTIVITY_TOTAL; offset += 100) {
      const page = await records.activity({
        clientId,
        kind: undefined,
        direction: 'desc',
        offset,
        limit: 100,
      });
      expect(page.total).toBe(ACTIVITY_TOTAL);
      expect(page.items).toHaveLength(100);
      seen.push(...page.items.map((item) => item.id));
    }
    expect(new Set(seen).size).toBe(ACTIVITY_TOTAL);

    const notes = await records.activity({
      clientId,
      kind: 'note',
      direction: 'asc',
      offset: 0,
      limit: 5,
    });
    expect(notes.total).toBe(ACTIVITY_TOTAL / 3);
    expect(notes.items.every((item) => item.body.kind === 'note')).toBe(true);
    const times = notes.items.map((item) => item.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));

    for (const kind of [undefined, 'note' as const]) {
      const plan = await pagePlan((q) =>
        q.activity({ clientId, kind, direction: 'desc', offset: 0, limit: 25 }),
      );
      expect(scansWithIndex(plan, 'client_activities')).toBe(true);
    }
  });
});

describe('opportunity history', () => {
  it('pages the activity of one opportunity by kind, with an index', async () => {
    const clientId = await seedClient('Ana', '+5491166899124');
    const [opportunityId, otherId] = [ids.next(), ids.next()];
    await db.insert(opportunities).values(
      [opportunityId, otherId].map((id) => ({
        id,
        clientId,
        originChannel: 'whatsapp',
        type: 'sale',
        intent: 'visit',
        status: 'new',
        createdAt: NOW,
        updatedAt: NOW,
        ...authored,
      })),
    );
    // 600 de la oportunidad (una de cada tres, nota) y 1.500 del mismo contacto en otra.
    const rows = Array.from({ length: 2_100 }, (_, i) => ({
      id: `00000000-0000-7000-a000-${(i + 1).toString().padStart(12, '0')}`,
      clientId,
      opportunityId: i < 600 ? opportunityId : otherId,
      kind: i % 3 === 0 ? 'note' : 'status_change',
      actorId: AGENT,
      body: i % 3 === 0 ? { text: `Nota ${i}` } : { from: 'new', to: 'contacted' },
      occurredAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 60_000),
      createdAt: NOW,
      updatedAt: NOW,
      ...authored,
    }));
    for (let start = 0; start < rows.length; start += 500) {
      await db.insert(clientActivities).values(rows.slice(start, start + 500));
    }
    await db.execute(sql`analyze core.client_activities`);

    const seen: string[] = [];
    for (let offset = 0; offset < 600; offset += 100) {
      const page = await records.opportunityActivity({
        opportunityId,
        kind: undefined,
        direction: 'desc',
        offset,
        limit: 100,
      });
      expect(page.total).toBe(600);
      expect(page.items.every((item) => item.opportunityId === opportunityId)).toBe(true);
      seen.push(...page.items.map((item) => item.id));
    }
    expect(new Set(seen).size).toBe(600);

    const notes = await records.opportunityActivity({
      opportunityId,
      kind: 'note',
      direction: 'desc',
      offset: 0,
      limit: 5,
    });
    expect(notes.total).toBe(200);
    expect(notes.items.every((item) => item.body.kind === 'note')).toBe(true);
    const times = notes.items.map((item) => item.occurredAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    for (const kind of [undefined, 'note' as const]) {
      const plan = await pagePlan((q) =>
        q.opportunityActivity({ opportunityId, kind, direction: 'desc', offset: 0, limit: 25 }),
      );
      expect(scansWithIndex(plan, 'client_activities')).toBe(true);
    }
  });
});

describe('featured listings', () => {
  it('features, lists and removes properties of a client', async () => {
    const clientId = await seedClient('Ana', '+5491166899124');
    const feature = new FeatureProperties({ uow, listings, ids, clock });

    const added = await feature.execute(
      { clientId, propertyIds: [PROPERTY, OTHER_PROPERTY] },
      manager,
    );
    const repeated = await feature.execute({ clientId, propertyIds: [PROPERTY] }, manager);
    expect(added.isOk() && added.value).toEqual({ featured: 2 });
    expect(repeated.isOk() && repeated.value).toEqual({ featured: 0 });

    const removed = await new UnfeatureProperty({ uow, clock }).execute(
      { clientId, propertyId: PROPERTY },
      manager,
    );
    expect(removed.isOk()).toBe(true);

    const page = await records.featured({ clientId, direction: 'desc', offset: 0, limit: 10 });
    expect(page.items.map((item) => item.propertyId)).toEqual([OTHER_PROPERTY]);
    expect(await records.featuredPropertyIds(clientId, [PROPERTY, OTHER_PROPERTY])).toEqual([
      OTHER_PROPERTY,
    ]);
    // La quitada queda como quitada: se puede volver a destacar.
    expect(await db.select().from(featuredListings)).toHaveLength(2);
    const again = await feature.execute({ clientId, propertyIds: [PROPERTY] }, manager);
    expect(again.isOk() && again.value).toEqual({ featured: 1 });

    const plan = await pagePlan((q) =>
      q.featured({ clientId, direction: 'desc', offset: 0, limit: 25 }),
    );
    expect(scansWithIndex(plan, 'featured_listings')).toBe(true);
  });
});

describe('opportunities, saved searches and counters', () => {
  it('lists them by client with an index and counts every tab', async () => {
    const clientId = await seedClient('Ana', '+5491166899124');
    const company = await seedClient('Acme', '+5491166899127');
    const trashed = await seedClient('Borrado', '+5491166899128');
    await db.execute(sql`update core.clients set deleted_at = ${NOW} where id = ${trashed}`);

    await db.insert(opportunities).values(
      ['new', 'won', 'contacted'].map((status, i) => ({
        id: ids.next(),
        clientId,
        originChannel: 'whatsapp',
        type: 'sale',
        intent: 'info',
        status,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
        updatedAt: NOW,
        ...authored,
      })),
    );
    await db.insert(savedSearches).values([
      {
        id: ids.next(),
        clientId,
        operation: 'sale',
        propertyTypes: ['apartment'],
        locationIds: [PROPERTY, OTHER_PROPERTY],
        currency: 'USD',
        maxPriceCents: 15_000_000n,
        createdAt: NOW,
        updatedAt: NOW,
        ...authored,
      },
      {
        id: ids.next(),
        clientId,
        operation: 'rent',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: NOW,
        deletedBy: AGENT,
        ...authored,
      },
    ]);
    await db.insert(clientRelations).values([
      { clientId, relatedClientId: company, kind: 'works_at', createdAt: NOW, createdBy: AGENT },
      {
        clientId: trashed,
        relatedClientId: clientId,
        kind: 'related',
        createdAt: NOW,
        createdBy: AGENT,
      },
    ]);
    await db.insert(clientActivities).values({
      id: ids.next(),
      clientId,
      kind: 'note',
      actorId: AGENT,
      body: { text: 'Hola' },
      occurredAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
      ...authored,
    });

    const list = await records.opportunities({ clientId, direction: 'desc', offset: 0, limit: 2 });
    expect(list.total).toBe(3);
    expect(list.items.map((item) => item.status)).toEqual(['contacted', 'won']);
    const active = await records.activeOpportunity(clientId, ['new', 'contacted']);
    expect(active).toMatchObject({ status: 'contacted', openCount: 2 });
    expect(await records.activeOpportunity(clientId, [])).toBeUndefined();

    const searches = await records.savedSearches({
      clientId,
      direction: 'desc',
      offset: 0,
      limit: 10,
    });
    expect(searches.items).toEqual([
      expect.objectContaining({
        operation: 'sale',
        propertyTypes: ['apartment'],
        locationCount: 2,
        maxPriceCents: 15_000_000n,
        unsubscribed: false,
      }),
    ]);

    expect(await records.tabCounts(clientId)).toEqual({
      activity: 1,
      opportunities: 3,
      featured: 0,
      savedSearches: 1,
      relations: 1,
    });

    for (const [table, run] of [
      [
        'opportunities',
        (q) => q.opportunities({ clientId, direction: 'desc', offset: 0, limit: 25 }),
      ],
      [
        'saved_searches',
        (q) => q.savedSearches({ clientId, direction: 'desc', offset: 0, limit: 25 }),
      ],
    ] as const satisfies readonly (readonly [
      string,
      (q: ClientRecordQuery) => Promise<unknown>,
    ])[]) {
      expect(scansWithIndex(await pagePlan(run), table)).toBe(true);
    }
    expect(await db.select({ id: clients.id }).from(clients)).toHaveLength(3);
  });
});
