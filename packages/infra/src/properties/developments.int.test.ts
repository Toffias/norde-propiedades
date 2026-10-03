import {
  Coordinates,
  Development,
  Property,
  type DevelopmentId,
  type DevelopmentListCriteria,
  type PanelPropertyListCriteria,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import { developments, features, locations, propertyTags } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzleDevelopmentListQuery } from './drizzle-development-list-query';
import { DrizzleDevelopmentRepository } from './drizzle-development-repository';
import { DrizzlePanelPropertyListQuery } from './drizzle-panel-property-list-query';
import { DrizzlePropertyDetailLookups } from './drizzle-property-detail-lookups';
import { DrizzlePropertyRepository } from './drizzle-property-repository';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const repository = new DrizzleDevelopmentRepository(db);
const propertyRepository = new DrizzlePropertyRepository(db, ids);
const list = new DrizzleDevelopmentListQuery(db);

const PRODUCER = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-10-01T12:00:00Z');

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

function newId(): DevelopmentId {
  return unwrap(parseId<'Development'>(ids.next()));
}

/** Un barrio suelto: la base se vacía antes de cada test. */
async function aLocation(): Promise<string> {
  const id = ids.next();
  await db.insert(locations).values({
    id,
    kind: 'neighborhood',
    name: 'Palermo',
    normalizedName: 'palermo',
    path: `/${id}/`,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: PRODUCER,
    updatedBy: PRODUCER,
  });
  return id;
}

async function aDevelopment(code: string, name = 'Torre Gurruchaga') {
  return Development.create({
    id: newId(),
    code,
    name,
    kind: 'building',
    privateAddress: 'Gurruchaga 1834',
    publishAddress: undefined,
    portalTitle: undefined,
    developerName: 'Constructora Sur',
    commercialContactClientId: undefined,
    locationId: await aLocation(),
    coordinates: unwrap(Coordinates.create(-34.5861, -58.4321)),
    producerUserId: PRODUCER,
    branchId: BRANCH,
    now: NOW,
  });
}

function aUnit(code: string, developmentId: string | undefined) {
  return unwrap(
    Property.create({
      id: unwrap(parseId<'Property'>(ids.next())),
      code,
      kind: 'apartment',
      operation: { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
      address: {
        street: 'Gurruchaga 1834',
        streetNumber: undefined,
        floor: '3',
        unit: 'B',
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'Buenos Aires',
      },
      publishAddress: undefined,
      portalTitle: undefined,
      coordinates: undefined,
      locationId: undefined,
      developmentId,
      producerUserId: PRODUCER,
      branchId: BRANCH,
      now: NOW,
    }),
  );
}

async function aFeature(): Promise<string> {
  const id = ids.next();
  await db.insert(features).values({
    id,
    kind: 'amenity',
    key: `amenity-${id}`,
    name: 'Pileta',
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: PRODUCER,
    updatedBy: PRODUCER,
  });
  return id;
}

async function aTag(name: string): Promise<string> {
  const id = ids.next();
  await db.insert(propertyTags).values({
    id,
    name,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: PRODUCER,
    updatedBy: PRODUCER,
  });
  return id;
}

describe('DrizzleDevelopmentRepository', () => {
  it('round-trips a development with its features and tags', async () => {
    const development = await aDevelopment('EMP0001');
    const [feature, tag] = [await aFeature(), await aTag('Pozo')];
    development.updateFeatures([feature], NOW);
    development.setTags([tag], NOW);
    development.updateDetails(
      {
        constructionStatus: 'under_construction',
        deliveryDate: '2027-12-01',
        description: 'Torre de 12 pisos',
        financingDetails: '36 cuotas',
        deal: { isFinanced: true, acceptsSwap: true, immediateDeed: false },
      },
      NOW,
    );
    await repository.save(development, PRODUCER);

    const loaded = await repository.findById(development.id);
    expect(loaded?.toSnapshot()).toEqual(development.toSnapshot());

    development.updateFeatures([], NOW);
    development.setTags([], NOW);
    unwrap(development.changeStatus('marketing', NOW));
    await repository.save(development, OTHER);
    expect((await repository.findById(development.id))?.toSnapshot()).toMatchObject({
      featureIds: [],
      tagIds: [],
      status: 'marketing',
    });
  });

  it('counts only the active units, and the units keep their development', async () => {
    const development = await aDevelopment('EMP0001');
    await repository.save(development, PRODUCER);
    const active = aUnit('DEP0001', development.id);
    const trashed = aUnit('DEP0002', development.id);
    unwrap(trashed.delete(PRODUCER, NOW));
    await propertyRepository.save(active, PRODUCER);
    await propertyRepository.save(trashed, PRODUCER);
    await propertyRepository.save(aUnit('DEP0003', undefined), PRODUCER);

    expect(await repository.countActiveUnits(development.id)).toBe(1);
    expect((await propertyRepository.findById(active.id))?.developmentId).toBe(development.id);

    const lookups = new DrizzlePropertyDetailLookups(db);
    expect(await lookups.development(development.id)).toEqual({
      id: development.id,
      code: 'EMP0001',
      name: 'Torre Gurruchaga',
    });

    const units = await new DrizzlePanelPropertyListQuery(db).search({
      view: 'active',
      owner: { kind: 'all' },
      text: undefined,
      operation: undefined,
      propertyType: undefined,
      status: undefined,
      location: undefined,
      price: undefined,
      ids: undefined,
      developmentId: development.id,
      sort: { field: 'updatedAt', direction: 'desc' },
      offset: 0,
      limit: 25,
    } satisfies PanelPropertyListCriteria);
    expect(units.items.map((item) => item.code)).toEqual(['DEP0001']);
  });
});

const BASE: DevelopmentListCriteria = {
  view: 'active',
  text: undefined,
  status: undefined,
  developmentType: undefined,
  constructionStatus: undefined,
  tagId: undefined,
  sort: { field: 'updatedAt', direction: 'desc' },
  offset: 0,
  limit: 25,
};

const TOTAL = 300;

/** 300 emprendimientos: 1 de cada 10 en la papelera, tipos y estados repartidos. */
async function seedDevelopments(tag: string) {
  const kinds = ['building', 'gated_community', 'lots'] as const;
  for (let start = 0; start < TOTAL; start += 100) {
    const rows = Array.from({ length: 100 }, (_, offset) => {
      const n = start + offset;
      return {
        id: ids.next(),
        code: `EMP${n.toString().padStart(4, '0')}`,
        slug: `emp-${n}`,
        name: `Emprendimiento ${n.toString().padStart(4, '0')}`,
        developmentType: kinds[n % 3] ?? 'building',
        status: n % 2 === 0 ? 'marketing' : 'loading',
        constructionStatus: n % 5 === 0 ? 'finished' : 'pre_sale',
        deliveryDate: n % 7 === 0 ? null : `2027-${((n % 12) + 1).toString().padStart(2, '0')}-01`,
        privateAddress: `Calle ${n} 1234`,
        publishAddress: `Calle ${n} al 1200`,
        updatedAt: new Date(NOW.getTime() + n * 60_000),
        createdAt: NOW,
        createdBy: PRODUCER,
        updatedBy: PRODUCER,
        deletedAt: n % 10 === 9 ? NOW : null,
        deletedBy: n % 10 === 9 ? OTHER : null,
      };
    });
    await db.insert(developments).values(rows);
  }
  await db.execute(sql`
    insert into core.development_tag_assignments (development_id, tag_id, created_at, created_by)
    select id, ${tag}, now(), ${PRODUCER} from core.developments where code like 'EMP00%'
  `);
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
 * El plan de la consulta de la página, con `enable_seqscan = off`: Postgres solo recorre la tabla
 * entera si no tiene un índice que resuelva el filtro y el orden.
 */
async function pagePlan(criteria: DevelopmentListCriteria): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await new DrizzleDevelopmentListQuery(logged).search(criteria);
    const page = captured.find(
      (q) => /\blimit\b/i.test(q.sql) && /"unit_?count"|count\(\*\)::int/i.test(q.sql),
    );
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

function scansWithIndex(nodes: readonly PlanNode[]): boolean {
  return !nodes.some(
    (n) =>
      n['Node Type'] === 'Seq Scan' &&
      (n['Relation Name'] === 'developments' || n['Relation Name'] === 'properties'),
  );
}

describe('DrizzleDevelopmentListQuery', () => {
  it('pages, sorts and shows the trash without losing or repeating rows', async () => {
    await seedDevelopments(await aTag('Pozo'));

    const first = await list.search(BASE);
    expect(first.total).toBe(TOTAL - TOTAL / 10);
    expect(first.items).toHaveLength(25);
    const seen = new Set<string>();
    for (let offset = 0; offset < first.total; offset += 25) {
      const page = await list.search({ ...BASE, offset });
      for (const item of page.items) seen.add(item.id);
    }
    expect(seen.size).toBe(first.total);

    const byName = await list.search({ ...BASE, sort: { field: 'name', direction: 'asc' } });
    expect(byName.items[0]?.name).toBe('Emprendimiento 0000');

    const byDelivery = await list.search({
      ...BASE,
      sort: { field: 'deliveryDate', direction: 'asc' },
      offset: first.total - 1,
    });
    expect(byDelivery.items[0]?.deliveryDate).toBeUndefined();

    const trash = await list.search({ ...BASE, view: 'trash' });
    expect(trash.total).toBe(TOTAL / 10);
    expect(trash.items[0]).toMatchObject({ deletedBy: OTHER, deletedAt: NOW });
  });

  it('filters by text, status, type, construction status and tag', async () => {
    const tag = await aTag('Pozo');
    await seedDevelopments(tag);

    const byText = await list.search({ ...BASE, text: 'emprendimiento 0042' });
    expect(byText.items.map((item) => item.code)).toEqual(['EMP0042']);

    const combined = await list.search({
      ...BASE,
      status: 'marketing',
      developmentType: 'building',
      constructionStatus: 'finished',
    });
    expect(combined.total).toBeGreaterThan(0);
    expect(
      combined.items.every(
        (i) =>
          i.status === 'marketing' &&
          i.developmentType === 'building' &&
          i.constructionStatus === 'finished',
      ),
    ).toBe(true);

    const tagged = await list.search({ ...BASE, tagId: tag });
    expect(tagged.total).toBe(90);
    expect(tagged.items[0]?.tags).toEqual([{ id: tag, name: 'Pozo' }]);
  });

  it('counts the active units of each row', async () => {
    const development = await aDevelopment('EMP9999');
    await repository.save(development, PRODUCER);
    await propertyRepository.save(aUnit('DEP0001', development.id), PRODUCER);
    await propertyRepository.save(aUnit('DEP0002', development.id), PRODUCER);
    const page = await list.search(BASE);
    expect(page.items[0]).toMatchObject({ code: 'EMP9999', unitCount: 2 });
  });

  it('resolves every filter and sort with an index', async () => {
    const tag = await aTag('Pozo');
    await seedDevelopments(tag);
    const cases: DevelopmentListCriteria[] = [
      BASE,
      { ...BASE, view: 'trash' },
      { ...BASE, text: 'torre' },
      { ...BASE, status: 'marketing' },
      { ...BASE, developmentType: 'lots' },
      { ...BASE, constructionStatus: 'finished' },
      { ...BASE, tagId: tag },
      { ...BASE, sort: { field: 'name', direction: 'asc' } },
      { ...BASE, sort: { field: 'code', direction: 'desc' } },
      { ...BASE, sort: { field: 'deliveryDate', direction: 'asc' } },
    ];
    for (const criteria of cases) {
      expect(scansWithIndex(await pagePlan(criteria)), JSON.stringify(criteria)).toBe(true);
    }
  });
});
