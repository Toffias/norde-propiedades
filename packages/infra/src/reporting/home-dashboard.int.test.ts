import type { HomeListRequest, HomeScope } from '@norde/core/reporting';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { SEEDED_STAGES, useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import {
  clients,
  developments,
  inquiries,
  mediaItems,
  opportunities,
  properties,
  propertyOperations,
  reservations,
} from '../db/schema';

import { DrizzleHomeDashboardQuery } from './drizzle-home-dashboard-query';

const db = useTestDatabase();
const home = new DrizzleHomeDashboardQuery(db);

const AGENT = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const NOW = new Date('2026-10-01T12:00:00Z');
const stamps = {
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'system:import',
  updatedBy: 'system:import',
};

const OPEN = ['new', 'contacted', 'visiting', 'negotiating', 'referred_to_partner'];

const id = (group: string, n: number) =>
  `00000000-0000-7000-${group}-${n.toString().padStart(12, '0')}`;

const ALL: HomeScope = { visibility: { kind: 'all' }, agentId: undefined, branchId: undefined };
const OWN: HomeScope = {
  visibility: { kind: 'own', ownerId: AGENT },
  agentId: undefined,
  branchId: undefined,
};
const BRANCH_MANAGER: HomeScope = {
  visibility: { kind: 'branch', ownerId: AGENT, branchId: BRANCH },
  agentId: undefined,
  branchId: undefined,
};

async function seedClients() {
  // Clientes 1 a 4 y el 9, en la papelera.
  await db.insert(clients).values(
    [1, 2, 3, 4, 9].map((n) => ({
      id: id('8000', n),
      name: `Cliente ${n.toString()}`,
      kind: 'person',
      ...stamps,
      deletedAt: n === 9 ? NOW : null,
      deletedBy: n === 9 ? AGENT : null,
    })),
  );
}

async function seedOpportunities() {
  await seedClients();
  const rows: {
    n: number;
    client: number;
    category: keyof typeof SEEDED_STAGES;
    agent: string;
    branch: string | null;
    channel: string;
    since: string;
  }[] = [
    {
      n: 1,
      client: 1,
      category: 'new',
      agent: AGENT,
      branch: BRANCH,
      channel: 'whatsapp',
      since: '2026-09-20',
    },
    {
      n: 2,
      client: 2,
      category: 'new',
      agent: OTHER,
      branch: OTHER_BRANCH,
      channel: 'zonaprop',
      since: '2026-09-10',
    },
    {
      n: 3,
      client: 1,
      category: 'contacted',
      agent: AGENT,
      branch: BRANCH,
      channel: 'zonaprop',
      since: '2026-09-15',
    },
    {
      n: 4,
      client: 3,
      category: 'won',
      agent: AGENT,
      branch: BRANCH,
      channel: 'office',
      since: '2026-09-01',
    },
    {
      n: 5,
      client: 9,
      category: 'new',
      agent: AGENT,
      branch: BRANCH,
      channel: 'whatsapp',
      since: '2026-09-01',
    },
    {
      n: 6,
      client: 4,
      category: 'visiting',
      agent: OTHER,
      branch: BRANCH,
      channel: 'whatsapp',
      since: '2026-09-25',
    },
  ];
  await db.insert(opportunities).values(
    rows.map((row) => ({
      id: id('9000', row.n),
      clientId: id('8000', row.client),
      originChannel: row.channel,
      type: 'sale',
      intent: 'info',
      status: row.category,
      stageId: SEEDED_STAGES[row.category],
      agentId: row.agent,
      branchId: row.branch,
      statusChangedAt: new Date(`${row.since}T12:00:00Z`),
      ...stamps,
    })),
  );
}

async function insertProperty(
  n: number,
  overrides: Partial<typeof properties.$inferInsert> = {},
): Promise<string> {
  const propertyId = id('a000', n);
  await db.insert(properties).values({
    id: propertyId,
    code: `NOR${n.toString().padStart(3, '0')}`,
    slug: `propiedad-${n.toString()}`,
    title: `Propiedad ${n.toString()}`,
    operation: 'sale',
    propertyType: 'apartment',
    status: 'available',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    currency: 'USD',
    producerUserId: AGENT,
    branchId: BRANCH,
    createdAt: NOW,
    updatedAt: new Date(NOW.getTime() + n * 60_000),
    ...overrides,
  });
  return propertyId;
}

const LIST: HomeListRequest = { sort: { field: 'code', direction: 'asc' }, offset: 0, limit: 5 };

describe('DrizzleHomeDashboardQuery: pending', () => {
  it('lists the oldest unassigned inquiries with the widget limit and their total', async () => {
    const propertyId = await insertProperty(1);
    await db.insert(inquiries).values(
      Array.from({ length: 9 }, (_, i) => ({
        id: id('b000', i + 1),
        channel: i % 2 === 0 ? 'zonaprop' : 'web_form',
        receivedAt: new Date(NOW.getTime() - (9 - i) * 3_600_000),
        senderName: `Persona ${i.toString()}`,
        propertyId: i === 0 ? propertyId : null,
        branchId: i < 4 ? BRANCH : OTHER_BRANCH,
        status: i === 7 ? 'assigned' : 'pending',
        deletedAt: i === 8 ? NOW : null,
        deletedBy: i === 8 ? AGENT : null,
        ...stamps,
      })),
    );

    const all = await home.unassignedInquiries({ branchId: undefined }, 5);
    expect(all.total).toBe(7);
    expect(all.items.map((item) => item.id)).toEqual([1, 2, 3, 4, 5].map((n) => id('b000', n)));
    expect(all.items[0]).toMatchObject({ propertyCode: 'NOR001', channel: 'zonaprop' });

    const branch = await home.unassignedInquiries({ branchId: OTHER_BRANCH }, 5);
    expect(branch.total).toBe(3);
  });

  it('lists the new opportunities within the reach and the filters', async () => {
    await seedOpportunities();
    const pending = (scope: HomeScope) => home.opportunitiesInCategories(scope, ['new'], 5);

    const all = await pending(ALL);
    // El cliente borrado queda afuera; la que más espera, primero.
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.id)).toEqual([id('9000', 2), id('9000', 1)]);
    expect(all.items[1]).toMatchObject({
      clientName: 'Cliente 1',
      stageName: 'new',
      originChannel: 'whatsapp',
      agentId: AGENT,
    });

    expect((await pending(OWN)).items.map((item) => item.id)).toEqual([id('9000', 1)]);
    expect((await pending(BRANCH_MANAGER)).total).toBe(1);
    expect((await pending({ ...ALL, agentId: OTHER })).items.map((item) => item.id)).toEqual([
      id('9000', 2),
    ]);
    expect((await pending({ ...ALL, branchId: BRANCH })).total).toBe(1);
    // Un agente que filtra por otro no amplía su alcance.
    expect((await pending({ ...OWN, agentId: OTHER })).total).toBe(0);
  });

  it('lists the active reservations to sign until a date, overdue ones included', async () => {
    await seedClients();
    const reservation = async (
      n: number,
      status: string,
      date: string | null,
      agent: string,
      branch: string,
    ) => {
      const propertyId = await insertProperty(n, { status: 'reserved' });
      await db.insert(reservations).values({
        id: id('c000', n),
        propertyId,
        clientId: id('8000', 1),
        agentUserId: agent,
        branchId: branch,
        operation: 'sale',
        status,
        reservedAt: NOW,
        estimatedSigningDate: date,
        ...stamps,
      });
    };
    await reservation(1, 'active', '2026-10-20', OTHER, OTHER_BRANCH);
    await reservation(2, 'active', '2026-09-28', AGENT, BRANCH);
    await reservation(3, 'active', '2026-12-01', AGENT, BRANCH);
    await reservation(4, 'signed', '2026-10-05', AGENT, BRANCH);
    await reservation(5, 'active', null, AGENT, BRANCH);

    const all = await home.activeReservationsSigningUntil(ALL, '2026-10-31', 5);
    expect(all.total).toBe(2);
    expect(all.items.map((item) => [item.propertyCode, item.estimatedSigningDate])).toEqual([
      ['NOR002', '2026-09-28'],
      ['NOR001', '2026-10-20'],
    ]);
    expect(all.items[0]).toMatchObject({ clientName: 'Cliente 1', propertyTitle: 'Propiedad 2' });

    const own = await home.activeReservationsSigningUntil(OWN, '2026-10-31', 5);
    expect(own.items.map((item) => item.id)).toEqual([id('c000', 2)]);
    const branch = await home.activeReservationsSigningUntil(
      { ...ALL, branchId: OTHER_BRANCH },
      '2026-10-31',
      5,
    );
    expect(branch.items.map((item) => item.id)).toEqual([id('c000', 1)]);
  });
});

describe('DrizzleHomeDashboardQuery: current state', () => {
  it('counts clients and open opportunities by channel and by stage', async () => {
    await seedOpportunities();

    expect(await home.clientsWithOpportunitiesIn(ALL, OPEN)).toBe(3);
    expect(await home.clientsWithOpportunitiesIn(OWN, OPEN)).toBe(1);
    expect(await home.clientsWithOpportunitiesIn(BRANCH_MANAGER, OPEN)).toBe(2);

    expect(await home.opportunitiesByChannel(ALL, OPEN)).toEqual([
      { channel: 'whatsapp', count: 2 },
      { channel: 'zonaprop', count: 2 },
    ]);
    expect(await home.opportunitiesByChannel(OWN, OPEN)).toEqual([
      { channel: 'whatsapp', count: 1 },
      { channel: 'zonaprop', count: 1 },
    ]);

    const stages = await home.opportunitiesByStage(ALL, OPEN);
    expect(stages.map((stage) => [stage.name, stage.count])).toEqual([
      ['new', 2],
      ['contacted', 1],
      ['visiting', 1],
      ['negotiating', 0],
      ['referred_to_partner', 0],
    ]);
    const ownStages = await home.opportunitiesByStage({ ...ALL, agentId: OTHER }, OPEN);
    expect(ownStages.map((stage) => stage.count)).toEqual([1, 0, 1, 0, 0]);
  });

  it('counts properties by status and developments in marketing within the reach', async () => {
    await insertProperty(1);
    await insertProperty(2, { status: 'reserved' });
    await insertProperty(3, { producerUserId: OTHER, branchId: OTHER_BRANCH });
    await insertProperty(4, { status: 'sold', producerUserId: OTHER, branchId: BRANCH });
    await insertProperty(5, { deletedAt: NOW, deletedBy: AGENT });

    expect(await home.propertiesByStatus(ALL)).toEqual([
      { status: 'available', count: 2 },
      { status: 'reserved', count: 1 },
      { status: 'sold', count: 1 },
    ]);
    expect(await home.propertiesByStatus(OWN)).toEqual([
      { status: 'available', count: 1 },
      { status: 'reserved', count: 1 },
    ]);
    expect(await home.propertiesByStatus(BRANCH_MANAGER)).toHaveLength(3);

    await seedDevelopments();
    expect(await home.availableDevelopmentsCount(ALL)).toBe(2);
    expect(await home.availableDevelopmentsCount(OWN)).toBe(1);
    expect(await home.availableDevelopmentsCount({ ...ALL, branchId: OTHER_BRANCH })).toBe(1);
  });

  it('pages the available properties without losing or repeating rows', async () => {
    for (let n = 1; n <= 12; n += 1) {
      await insertProperty(n, n > 7 ? { producerUserId: OTHER, branchId: OTHER_BRANCH } : {});
    }
    await insertProperty(13, { status: 'sold' });
    await db.insert(propertyOperations).values([
      {
        id: id('d000', 1),
        propertyId: id('a000', 1),
        operation: 'sale',
        currency: 'USD',
        priceCents: 12_000_000n,
        ...stamps,
      },
      {
        id: id('d000', 2),
        propertyId: id('a000', 1),
        operation: 'rent',
        currency: 'ARS',
        priceCents: 90_000_000n,
        priceOnRequest: true,
        ...stamps,
      },
    ]);

    const seen: string[] = [];
    for (let offset = 0; offset < 12; offset += 5) {
      const page = await home.availableProperties(ALL, { ...LIST, offset });
      expect(page.total).toBe(12);
      seen.push(...page.items.map((item) => item.code));
    }
    expect(seen).toEqual(
      Array.from({ length: 12 }, (_, i) => `NOR${(i + 1).toString().padStart(3, '0')}`),
    );

    const first = await home.availableProperties(ALL, LIST);
    expect(first.items[0]?.operations).toEqual([
      { operation: 'rent', currency: 'ARS', priceCents: null },
      { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
    ]);
    const recent = await home.availableProperties(ALL, {
      ...LIST,
      sort: { field: 'updatedAt', direction: 'desc' },
    });
    expect(recent.items[0]?.code).toBe('NOR012');
    expect((await home.availableProperties(OWN, LIST)).total).toBe(7);
    expect((await home.availableProperties({ ...ALL, agentId: OTHER }, LIST)).total).toBe(5);
  });

  it('shows the cover of each available property, or its first photo', async () => {
    const withCover = await insertProperty(1);
    const withPhotos = await insertProperty(2);
    await insertProperty(3);
    const photo = (n: number, propertyId: string, position: number, isCover = false) => ({
      id: id('e000', n),
      propertyId,
      kind: 'photo',
      storageKey: `properties/${propertyId}/${String(n)}.jpg`,
      url: `properties/${propertyId}/${String(n)}.jpg`,
      position,
      isCover,
      uploadedBy: 'system:import',
      ...stamps,
    });
    await db
      .insert(mediaItems)
      .values([
        photo(1, withCover, 0),
        { ...photo(2, withCover, 1, true), variants: { thumbnail: 'thumb.jpg' } },
        photo(3, withPhotos, 1),
        photo(4, withPhotos, 0),
        { ...photo(5, withPhotos, -1), kind: 'floor_plan' },
      ]);

    const page = await home.availableProperties(ALL, LIST);

    expect(page.items.map((item) => item.cover)).toEqual([
      { mediaId: id('e000', 2), hasThumbnail: true },
      { mediaId: id('e000', 4), hasThumbnail: false },
      undefined,
    ]);
  });

  it('lists the developments in marketing with their available units', async () => {
    await seedDevelopments();
    const page = await home.availableDevelopments(ALL, LIST);
    expect(page.total).toBe(2);
    expect(page.items.map((item) => [item.code, item.availableUnits])).toEqual([
      ['EMP001', 2],
      ['EMP002', 0],
    ]);
    expect((await home.availableDevelopments(OWN, LIST)).items.map((item) => item.code)).toEqual([
      'EMP001',
    ]);
  });
});

async function seedDevelopments() {
  const rows = [
    { n: 1, status: 'marketing', agent: AGENT, branch: BRANCH, deleted: false },
    { n: 2, status: 'marketing', agent: OTHER, branch: OTHER_BRANCH, deleted: false },
    { n: 3, status: 'loading', agent: AGENT, branch: BRANCH, deleted: false },
    { n: 4, status: 'marketing', agent: AGENT, branch: BRANCH, deleted: true },
  ];
  await db.insert(developments).values(
    rows.map((row) => ({
      id: id('e000', row.n),
      code: `EMP${row.n.toString().padStart(3, '0')}`,
      slug: `emp-${row.n.toString()}`,
      name: `Emprendimiento ${row.n.toString()}`,
      status: row.status,
      producerUserId: row.agent,
      branchId: row.branch,
      ...stamps,
      deletedAt: row.deleted ? NOW : null,
      deletedBy: row.deleted ? AGENT : null,
    })),
  );
  // Dos unidades disponibles y una vendida del primero.
  await insertProperty(101, { developmentId: id('e000', 1) });
  await insertProperty(102, { developmentId: id('e000', 1) });
  await insertProperty(103, { developmentId: id('e000', 1), status: 'sold' });
}

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

const SCANNED = ['inquiries', 'opportunities', 'reservations', 'properties', 'developments'];

/**
 * Las tablas grandes que recorre cada consulta de `run`, con `enable_seqscan = off`: Postgres solo
 * recorre la tabla entera si no tiene un índice que resuelva el filtro.
 */
async function seqScans(
  run: (query: DrizzleHomeDashboardQuery) => Promise<unknown>,
): Promise<string[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await run(new DrizzleHomeDashboardQuery(logged));
    const client = await pool.connect();
    const scanned: string[] = [];
    try {
      for (const query of captured) {
        await client.query('begin');
        await client.query('set local enable_seqscan = off');
        const result = await client.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
          `explain (format json) ${query.sql}`,
          query.params,
        );
        await client.query('rollback');
        const [plan] = result.rows[0]?.['QUERY PLAN'] ?? [];
        if (!plan) throw new Error('No plan');
        for (const node of flatten(plan.Plan)) {
          const relation = node['Relation Name'];
          if (node['Node Type'] === 'Seq Scan' && relation && SCANNED.includes(relation)) {
            scanned.push(relation);
          }
        }
      }
    } finally {
      client.release();
    }
    return scanned;
  } finally {
    await pool.end();
  }
}

describe('DrizzleHomeDashboardQuery: indexes', () => {
  it('resolves every widget, scope and filter with an index', async () => {
    await seedOpportunities();
    await seedDevelopments();
    const scopes: HomeScope[] = [
      ALL,
      OWN,
      BRANCH_MANAGER,
      { ...ALL, agentId: OTHER },
      { ...ALL, branchId: BRANCH },
    ];
    for (const scope of scopes) {
      const scanned = await seqScans(async (query) => {
        await query.unassignedInquiries({ branchId: scope.branchId }, 5);
        await query.opportunitiesInCategories(scope, ['new'], 5);
        await query.activeReservationsSigningUntil(scope, '2026-10-31', 5);
        await query.clientsWithOpportunitiesIn(scope, OPEN);
        await query.opportunitiesByChannel(scope, OPEN);
        await query.opportunitiesByStage(scope, OPEN);
        await query.propertiesByStatus(scope);
        await query.availableDevelopmentsCount(scope);
        await query.availableProperties(scope, LIST);
        await query.availableDevelopments(scope, LIST);
      });
      expect(scanned, JSON.stringify(scope)).toEqual([]);
    }
  });
});
