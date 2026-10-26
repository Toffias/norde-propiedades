import {
  PUBLICATION_BUCKETS,
  publicationCriteria,
  type PortalPublicationRequest,
  type PublicationBucket,
} from '@norde/core/reporting';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import { developments, portalAccounts, portalListings, properties } from '../db/schema';

import { DrizzlePublicationOverviewQuery } from './drizzle-publication-overview-query';

const db = useTestDatabase();
const query = new DrizzlePublicationOverviewQuery(db);

const NOW = new Date('2026-10-01T12:00:00Z');
const stamps = { createdBy: 'system:import', updatedBy: 'system:import' };
const PUBLISHABLE = { property: 'available', development: 'marketing' };

const id = (group: string, n: number) =>
  `00000000-0000-7000-${group}-${n.toString().padStart(12, '0')}`;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

async function insertProperty(n: number, overrides: Partial<typeof properties.$inferInsert> = {}) {
  await db.insert(properties).values({
    id: id('a000', n),
    code: `NOR${n.toString().padStart(3, '0')}`,
    slug: `propiedad-${n.toString()}`,
    title: `Propiedad ${n.toString()}`,
    propertyType: 'apartment',
    status: 'available',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    createdAt: NOW,
    updatedAt: at(n),
    ...stamps,
    ...overrides,
  });
}

async function insertDevelopment(
  n: number,
  overrides: Partial<typeof developments.$inferInsert> = {},
) {
  await db.insert(developments).values({
    id: id('e000', n),
    code: `EMP${n.toString().padStart(3, '0')}`,
    slug: `emp-${n.toString()}`,
    name: `Emprendimiento ${n.toString()}`,
    status: 'marketing',
    createdAt: NOW,
    updatedAt: at(n),
    ...stamps,
    ...overrides,
  });
}

const listing = (
  n: number,
  values: Partial<typeof portalListings.$inferInsert>,
): typeof portalListings.$inferInsert => ({
  id: id('c100', n),
  portal: 'mercadolibre',
  operation: 'sale',
  status: 'published',
  externalId: `EXT${n.toString()}`,
  createdAt: NOW,
  updatedAt: at(100 + n),
  ...stamps,
  ...values,
});

/**
 * Propiedades: 1 a 6 disponibles (1 a 4 en la web), 7 reservada, 8 en la papelera y 9 unidad del
 * emprendimiento 1. Emprendimientos: 1 y 2 en comercialización (el 1 en la web), 3 cargando.
 * MercadoLibre y Zonaprop prendidos; la cuenta de emprendimientos de ML, apagada.
 */
async function seed() {
  await db.insert(portalAccounts).values([
    { portal: 'mercadolibre', isEnabled: true, createdAt: NOW, updatedAt: NOW, ...stamps },
    { portal: 'mercadolibre_developments', createdAt: NOW, updatedAt: NOW, ...stamps },
    { portal: 'zonaprop', isEnabled: true, createdAt: NOW, updatedAt: NOW, ...stamps },
  ]);
  await insertDevelopment(1, { publishedOnWeb: true });
  await insertDevelopment(2);
  await insertDevelopment(3, { status: 'loading' });
  for (const n of [1, 2, 3, 4, 5, 6]) await insertProperty(n, { publishedOnWeb: n <= 4 });
  await insertProperty(7, { status: 'reserved', publishedOnWeb: true });
  await insertProperty(8, { deletedAt: NOW, deletedBy: 'system:import' });
  await insertProperty(9, { developmentId: id('e000', 1), publishedOnWeb: true });

  const property = (n: number) => id('a000', n);
  await db.insert(portalListings).values([
    // MercadoLibre: la 1 en venta (simple) y alquiler (destacada), la 2 destacada, la 3 pausada
    // por el portal, la 7 pausada por la reserva, la 4 con error y la 5 dada de baja.
    listing(1, { propertyId: property(1) }),
    listing(2, { propertyId: property(1), operation: 'rent', listingType: 'featured' }),
    listing(3, { propertyId: property(2), listingType: 'featured' }),
    listing(4, {
      propertyId: property(3),
      status: 'paused',
      lastError: 'MercadoLibre venció el aviso.',
    }),
    listing(5, { propertyId: property(7), status: 'paused' }),
    listing(6, {
      propertyId: property(4),
      status: 'error',
      externalId: null,
      lastError: 'Faltan fotos.',
    }),
    listing(7, { propertyId: property(5), status: 'unpublished', intent: 'closed' }),
    // Zonaprop: la 1 con plan simple, la 2 con plan Home, el emprendimiento 1 pendiente.
    listing(8, { portal: 'zonaprop', propertyId: property(1), operation: null, plan: 'SIMPLE' }),
    listing(9, { portal: 'zonaprop', propertyId: property(2), operation: null, plan: 'HOME' }),
    listing(10, {
      portal: 'zonaprop',
      developmentId: id('e000', 1),
      operation: null,
      status: 'pending',
      externalId: null,
    }),
  ]);
}

const request = (
  portal: PortalPublicationRequest['portal'],
  kind: PortalPublicationRequest['kind'],
  bucket: PublicationBucket,
): PortalPublicationRequest => ({
  portal,
  kind,
  criteria: publicationCriteria(bucket),
  publishable: PUBLISHABLE,
  sort: { field: 'updatedAt', direction: 'desc' },
  offset: 0,
  limit: 20,
});

const codes = async (req: PortalPublicationRequest) => {
  const page = await query.list(req);
  return { total: page.total, codes: page.items.map((row) => row.owner.code) };
};

describe('DrizzlePublicationOverviewQuery', () => {
  it('lists the enabled portals', async () => {
    await seed();
    expect([...(await query.enabledPortals())].sort()).toEqual(['mercadolibre', 'zonaprop']);
  });

  it('counts the standalone available properties, the marketing developments and the web', async () => {
    await seed();
    expect(await query.availability(PUBLISHABLE)).toEqual({
      properties: { available: 6, onWeb: 4 },
      developments: { available: 2, onWeb: 1 },
    });
  });

  it('aggregates the live listings by portal, kind, status, type, plan and reason', async () => {
    await seed();
    const tallies = await query.listingTallies(['mercadolibre', 'zonaprop']);
    const ml = tallies.find((t) => t.portal === 'mercadolibre' && t.kind === 'property');
    expect(ml?.publishedOwners).toBe(2);
    expect(ml?.tallies).toEqual(
      expect.arrayContaining([
        { status: 'published', listingType: 'simple', plan: undefined, hasReason: false, count: 1 },
        {
          status: 'published',
          listingType: 'featured',
          plan: undefined,
          hasReason: false,
          count: 2,
        },
        { status: 'paused', listingType: 'simple', plan: undefined, hasReason: true, count: 1 },
        { status: 'paused', listingType: 'simple', plan: undefined, hasReason: false, count: 1 },
        { status: 'error', listingType: 'simple', plan: undefined, hasReason: true, count: 1 },
      ]),
    );
    expect(ml?.tallies).toHaveLength(5);
    const zpDevelopments = tallies.find((t) => t.portal === 'zonaprop' && t.kind === 'development');
    expect(zpDevelopments).toMatchObject({ publishedOwners: 0 });
    expect(await query.listingTallies([])).toEqual([]);
  });

  it('counts what is available without a live listing in the portal', async () => {
    await seed();
    // ML: la 5 (dada de baja) y la 6. Zonaprop: 3 a 6, y el emprendimiento 2.
    expect(await query.missingCount('mercadolibre', 'property', PUBLISHABLE)).toBe(2);
    expect(await query.missingCount('zonaprop', 'property', PUBLISHABLE)).toBe(4);
    expect(await query.missingCount('zonaprop', 'development', PUBLISHABLE)).toBe(1);
  });

  it('lists each counter, the latest change first', async () => {
    await seed();
    expect(await codes(request('mercadolibre', 'property', 'published'))).toEqual({
      total: 3,
      codes: ['NOR002', 'NOR001', 'NOR001'],
    });
    expect(await codes(request('mercadolibre', 'property', 'simple'))).toEqual({
      total: 1,
      codes: ['NOR001'],
    });
    expect(await codes(request('mercadolibre', 'property', 'featured'))).toEqual({
      total: 2,
      codes: ['NOR002', 'NOR001'],
    });
    expect(await codes(request('mercadolibre', 'property', 'review'))).toEqual({
      total: 1,
      codes: ['NOR003'],
    });
    expect(await codes(request('mercadolibre', 'property', 'paused'))).toEqual({
      total: 1,
      codes: ['NOR007'],
    });
    expect(await codes(request('mercadolibre', 'property', 'error'))).toEqual({
      total: 1,
      codes: ['NOR004'],
    });
    expect(await codes(request('mercadolibre', 'property', 'missing'))).toEqual({
      total: 2,
      codes: ['NOR006', 'NOR005'],
    });
  });

  it('tells simple and featured plans apart in Zonaprop', async () => {
    await seed();
    expect((await codes(request('zonaprop', 'property', 'simple'))).codes).toEqual(['NOR001']);
    expect((await codes(request('zonaprop', 'property', 'featured'))).codes).toEqual(['NOR002']);
  });

  it('lists developments with their listing or without one', async () => {
    await seed();
    const pending = await query.list(request('zonaprop', 'development', 'pending'));
    expect(pending.items).toEqual([
      {
        owner: { kind: 'development', id: id('e000', 1), code: 'EMP001', name: 'Emprendimiento 1' },
        listing: {
          id: id('c100', 10),
          operation: undefined,
          listingType: 'simple',
          plan: undefined,
          status: 'pending',
          lastError: undefined,
          permalink: undefined,
        },
        updatedAt: at(110),
      },
    ]);
    const missing = await query.list(request('zonaprop', 'development', 'missing'));
    expect(missing.items).toEqual([
      {
        owner: { kind: 'development', id: id('e000', 2), code: 'EMP002', name: 'Emprendimiento 2' },
        listing: undefined,
        updatedAt: at(2),
      },
    ]);
  });

  it('pages in the database', async () => {
    await seed();
    const page = await query.list({
      ...request('mercadolibre', 'property', 'published'),
      sort: { field: 'updatedAt', direction: 'asc' },
      offset: 1,
      limit: 1,
    });
    expect(page.total).toBe(3);
    expect(page.items.map((row) => row.listing?.id)).toEqual([id('c100', 2)]);
  });

  it('resolves every counter and list with an index', async () => {
    await seed();
    const scanned = await seqScans(async (q) => {
      await q.availability(PUBLISHABLE);
      await q.listingTallies(['mercadolibre', 'zonaprop']);
      for (const kind of ['property', 'development'] as const) {
        await q.missingCount('zonaprop', kind, PUBLISHABLE);
        for (const bucket of PUBLICATION_BUCKETS) await q.list(request('zonaprop', kind, bucket));
      }
    });
    expect(scanned).toEqual([]);
  });
});

interface PlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly Plans?: readonly PlanNode[];
}

function flatten(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flatten)];
}

const SCANNED = ['properties', 'developments', 'portal_listings'];

/** Las tablas grandes que recorre cada consulta, con `enable_seqscan = off`. */
async function seqScans(
  run: (q: DrizzlePublicationOverviewQuery) => Promise<unknown>,
): Promise<string[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await run(new DrizzlePublicationOverviewQuery(logged));
    const client = await pool.connect();
    const scanned: string[] = [];
    try {
      for (const captive of captured) {
        await client.query('begin');
        await client.query('set local enable_seqscan = off');
        const result = await client.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
          `explain (format json) ${captive.sql}`,
          captive.params,
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
