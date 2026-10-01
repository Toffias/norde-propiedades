import {
  Coordinates,
  Property,
  type PanelPropertyListCriteria,
  type PropertyId,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import { properties, propertyOperations } from '../db/schema';
import { UuidV7IdGenerator } from '../shared/uuid-v7-id-generator';

import { DrizzlePanelPropertyListQuery } from './drizzle-panel-property-list-query';
import { DrizzlePropertyRepository } from './drizzle-property-repository';

const db = useTestDatabase();
const ids = new UuidV7IdGenerator();
const repository = new DrizzlePropertyRepository(db, ids);
const query = new DrizzlePanelPropertyListQuery(db);

const PRODUCER = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const NOW = new Date('2026-10-01T12:00:00Z');

function unwrap<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error(`Expected Ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

function newId(): PropertyId {
  return unwrap(parseId<'Property'>(ids.next()));
}

function aProperty(code: string) {
  return unwrap(
    Property.create({
      id: newId(),
      code,
      kind: 'apartment',
      operation: { operation: 'sale', currency: 'USD', priceCents: 12_000_000n },
      address: {
        street: 'Gurruchaga',
        streetNumber: '1834',
        floor: '3',
        unit: 'B',
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'Buenos Aires',
      },
      publishAddress: undefined,
      portalTitle: undefined,
      coordinates: unwrap(Coordinates.create(-34.5861, -58.4321)),
      producerUserId: PRODUCER,
      branchId: BRANCH,
      now: NOW,
    }),
  );
}

describe('DrizzlePropertyRepository', () => {
  it('round-trips a new property with its operation', async () => {
    const property = aProperty('DEP0001');
    await repository.save(property, PRODUCER);

    const loaded = await repository.findById(property.id);

    expect(loaded?.toSnapshot()).toEqual(property.toSnapshot());
    const [row] = await db.select().from(properties).where(eq(properties.id, property.id));
    expect(row).toMatchObject({
      // Columnas legacy que lee la búsqueda pública.
      title: 'Departamento en venta en Palermo',
      operation: 'sale',
      currency: 'USD',
      priceCents: 12_000_000n,
      address: 'Gurruchaga 1834',
      createdBy: PRODUCER,
      updatedBy: PRODUCER,
    });
  });

  it('saves the trash state without touching the rest of the row', async () => {
    const property = aProperty('DEP0002');
    await repository.save(property, PRODUCER);
    await db
      .update(properties)
      .set({ description: 'Editada en la ficha' })
      .where(eq(properties.id, property.id));

    unwrap(property.delete(OTHER, new Date('2026-10-02T12:00:00Z')));
    await repository.save(property, OTHER);

    const [row] = await db.select().from(properties).where(eq(properties.id, property.id));
    expect(row).toMatchObject({
      description: 'Editada en la ficha',
      deletedBy: OTHER,
      updatedBy: OTHER,
      createdBy: PRODUCER,
    });
    expect((await repository.findById(property.id))?.isDeleted).toBe(true);
    const operations = await db
      .select()
      .from(propertyOperations)
      .where(eq(propertyOperations.propertyId, property.id));
    expect(operations).toHaveLength(1);
  });
});

// ---------- Buscador del panel ----------

const OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;
const TYPES = ['apartment', 'house', 'ph', 'land'] as const;
const STATUSES = ['draft', 'available', 'reserved', 'sold'] as const;
const PLACES = [
  ['Palermo', 'CABA', 'Buenos Aires'],
  ['Belgrano', 'CABA', 'Buenos Aires'],
  ['Florida', 'Vicente López', 'Buenos Aires'],
  ['Centro', 'Córdoba', 'Córdoba'],
] as const;
const TOTAL = 5_000;

function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (item === undefined) throw new Error('Empty list');
  return item;
}

/** 5.000 propiedades con una distribución conocida, insertadas en SQL por volumen. */
async function seedPortfolio(): Promise<void> {
  const rows = Array.from({ length: TOTAL }, (_, i) => {
    const [neighborhood, city, province] = pick(PLACES, i);
    const deleted = i % 50 === 0;
    return {
      id: `00000000-0000-7000-8000-${(i + 1).toString().padStart(12, '0')}`,
      code: `P${(i + 1).toString().padStart(5, '0')}`,
      slug: `p-${i + 1}`,
      title: `Propiedad ${i + 1}`,
      operation: pick(OPERATIONS, i),
      propertyType: pick(TYPES, i),
      status: pick(STATUSES, i),
      neighborhood,
      city,
      province,
      street: `Calle ${i + 1}`,
      currency: i % 2 === 0 ? 'USD' : 'ARS',
      producerUserId: i % 10 === 0 ? PRODUCER : OTHER,
      branchId: i % 4 === 0 ? BRANCH : null,
      createdAt: new Date(Date.UTC(2025, 0, 1) + i * 60_000),
      updatedAt: new Date(Date.UTC(2026, 0, 1) + ((i * 7919) % TOTAL) * 60_000),
      deletedAt: deleted ? NOW : null,
      deletedBy: deleted ? OTHER : null,
    };
  });
  for (let start = 0; start < rows.length; start += 500) {
    await db.insert(properties).values(rows.slice(start, start + 500));
  }
  const operations = rows.map((row, i) => ({
    id: `00000000-0000-7000-9000-${(i + 1).toString().padStart(12, '0')}`,
    propertyId: row.id,
    operation: row.operation,
    currency: row.currency,
    // Precios distintos y conocidos: 1.000 a 5.000.000 unidades.
    priceCents: BigInt((i + 1) * 1_000) * 100n,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: 'system:import',
    updatedBy: 'system:import',
  }));
  for (let start = 0; start < operations.length; start += 500) {
    await db.insert(propertyOperations).values(operations.slice(start, start + 500));
  }
  await db.execute(sql`analyze core.properties; analyze core.property_operations`);
}

const BASE: PanelPropertyListCriteria = {
  view: 'active',
  owner: { kind: 'all' },
  text: undefined,
  operation: undefined,
  propertyType: undefined,
  status: undefined,
  location: undefined,
  price: undefined,
  sort: { field: 'updatedAt', direction: 'desc' },
  offset: 0,
  limit: 25,
};

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly 'Index Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

/**
 * El plan de la consulta de la página: se captura el SQL que arma la query (con un logger de
 * drizzle) y se le pide `explain` a Postgres con los mismos parámetros.
 *
 * Con 5.000 filas la tabla entra en pocas páginas y el planner a veces prefiere leerla entera. Lo que
 * se verifica es que exista un índice que resuelva cada filtro y orden: con `enable_seqscan = off`,
 * Postgres solo recorre la tabla entera si no tiene otra forma.
 */
async function pagePlan(criteria: PanelPropertyListCriteria): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await new DrizzlePanelPropertyListQuery(logged).search(criteria);
    // La primera consulta con `limit` es la de la página (después vienen el total y las operaciones).
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

/** Ningún recorrido secuencial de `properties`: cada filtro y orden se resuelve con un índice. */
function scansWithIndex(nodes: readonly PlanNode[]): boolean {
  return !nodes.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'properties');
}

describe('DrizzlePanelPropertyListQuery', () => {
  it('pages, filters and sorts 5.000 properties in the database', async () => {
    await seedPortfolio();

    const firstPage = await query.search(BASE);
    expect(firstPage.total).toBe(TOTAL - TOTAL / 50);
    expect(firstPage.items).toHaveLength(25);
    const updated = firstPage.items.map((item) => item.updatedAt.getTime());
    expect(updated).toEqual([...updated].sort((a, b) => b - a));

    const lastPage = await query.search({ ...BASE, offset: 4_900 - 25, limit: 25 });
    expect(lastPage.items).toHaveLength(25);
    const beyond = await query.search({ ...BASE, offset: 4_900, limit: 25 });
    expect(beyond.items).toEqual([]);

    const trash = await query.search({ ...BASE, view: 'trash' });
    expect(trash.total).toBe(TOTAL / 50);
    expect(trash.items[0]).toMatchObject({ deletedBy: OTHER, deletedAt: NOW });

    const mine = await query.search({ ...BASE, owner: { kind: 'producer', userId: PRODUCER } });
    expect(mine.items.every((item) => item.producerUserId === PRODUCER)).toBe(true);
    expect(mine.total).toBe(TOTAL / 10 - TOTAL / 50);

    const branch = await query.search({ ...BASE, owner: { kind: 'branch', branchId: BRANCH } });
    expect(branch.total).toBe(TOTAL / 4 - TOTAL / 100);
  });

  it('filters by text, type, status, location, operation and price', async () => {
    await seedPortfolio();

    const byCode = await query.search({ ...BASE, text: 'p00042' });
    expect(byCode.items.map((item) => item.code)).toEqual(['P00042']);

    const houses = await query.search({ ...BASE, propertyType: 'house', status: 'available' });
    expect(houses.items.every((i) => i.propertyType === 'house' && i.status === 'available')).toBe(
      true,
    );
    expect(houses.total).toBeGreaterThan(0);

    const vicenteLopez = await query.search({ ...BASE, location: 'vicente lopez' });
    expect(vicenteLopez.items.every((item) => item.city === 'Vicente López')).toBe(true);
    expect(vicenteLopez.total).toBeGreaterThan(0);

    const priced = await query.search({
      ...BASE,
      operation: 'rent',
      price: { currency: 'ARS', minCents: 100_000_000n, maxCents: 200_000_000n },
      sort: { field: 'price', direction: 'asc' },
    });
    expect(priced.total).toBeGreaterThan(0);
    const prices = priced.items.map((item) => {
      const rent = item.operations.find((o) => o.operation === 'rent');
      expect(rent?.currency).toBe('ARS');
      return rent?.priceCents ?? -1n;
    });
    expect(prices.every((price) => price >= 100_000_000n && price <= 200_000_000n)).toBe(true);
    expect(prices).toEqual([...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('sorts by code and creation date in both directions', async () => {
    await seedPortfolio();
    const byCode = await query.search({ ...BASE, sort: { field: 'code', direction: 'asc' } });
    expect(byCode.items[0]?.code).toBe('P00002');
    const newest = await query.search({ ...BASE, sort: { field: 'createdAt', direction: 'desc' } });
    expect(newest.items[0]?.code).toBe('P05000');
  });

  it.each<[string, Partial<PanelPropertyListCriteria>]>([
    ['default sort', {}],
    ['creation date', { sort: { field: 'createdAt', direction: 'desc' } }],
    ['code', { sort: { field: 'code', direction: 'asc' } }],
    ['text', { text: 'p00042' }],
    ['location', { location: 'vicente lopez' }],
    ['type and status', { propertyType: 'house', status: 'available' }],
    ['my properties', { owner: { kind: 'producer', userId: PRODUCER } }],
    ['my branch', { owner: { kind: 'branch', branchId: BRANCH } }],
    ['trash', { view: 'trash' }],
    [
      'operation and price',
      {
        operation: 'rent',
        price: { currency: 'ARS', minCents: 100_000_000n, maxCents: 200_000_000n },
        sort: { field: 'price', direction: 'asc' },
      },
    ],
  ])('resolves the %s with an index', async (_name, criteria) => {
    await seedPortfolio();
    const nodes = await pagePlan({ ...BASE, ...criteria });
    const summary = nodes.map((n) => [n['Node Type'], n['Relation Name'], n['Index Name']]);
    expect(scansWithIndex(nodes), JSON.stringify(summary)).toBe(true);
  });
});
