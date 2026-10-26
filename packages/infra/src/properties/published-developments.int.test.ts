import type { PublishedDevelopmentCriteria } from '@norde/core/properties';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import * as schema from '../db/schema';
import {
  developmentFeatures,
  developments,
  features,
  locations,
  mediaItems,
  properties,
  propertyOperations,
} from '../db/schema';

import { DrizzlePublishedDevelopmentQuery } from './drizzle-published-development-query';

const db = useTestDatabase();
const query = new DrizzlePublishedDevelopmentQuery(db);
let sequence = 0;

const AUTHOR = 'system:import';
const NOW = new Date('2026-10-01T12:00:00Z');
const LISTED: PublishedDevelopmentCriteria['unitStatuses'] = ['available'];

const BASE: PublishedDevelopmentCriteria = {
  statuses: ['marketing'],
  unitStatuses: LISTED,
  sort: 'newest',
  offset: 0,
  limit: 12,
};

function nextId(block: string): string {
  sequence += 1;
  return `00000000-0000-7000-${block}-${sequence.toString().padStart(12, '0')}`;
}

const stamps = { createdAt: NOW, updatedAt: NOW, createdBy: AUTHOR, updatedBy: AUTHOR };

/** Argentina → CABA → Palermo → Palermo Soho, con la ruta materializada. */
async function insertLocationTree(): Promise<string> {
  let path = '/';
  let parentId: string | undefined;
  const levels = [
    ['country', 'Argentina'],
    ['province', 'Buenos Aires'],
    ['city', 'CABA'],
    ['neighborhood', 'Palermo'],
  ] as const;
  for (const [kind, name] of levels) {
    const id = nextId('8005');
    path = `${path}${id}/`;
    await db.insert(locations).values({
      id,
      parentId,
      kind,
      name,
      normalizedName: name.toLowerCase(),
      path,
      ...stamps,
    });
    parentId = id;
  }
  if (!parentId) throw new Error('No location');
  return parentId;
}

async function insertDevelopment(overrides: Partial<typeof developments.$inferInsert> = {}) {
  const n = ++sequence;
  const row = {
    id: nextId('8006'),
    code: `EMP${n.toString().padStart(4, '0')}`,
    slug: `emprendimiento-${n}`,
    name: `Emprendimiento ${n}`,
    developmentType: 'building',
    status: 'marketing',
    privateAddress: 'Gurruchaga 1834',
    publishAddress: 'Gurruchaga al 1800',
    developerName: 'Constructora Sur',
    ...stamps,
    createdAt: new Date(Date.UTC(2026, 0, n)),
    ...overrides,
  };
  await db.insert(developments).values(row);
  return row;
}

async function insertUnit(
  developmentId: string,
  overrides: Partial<typeof properties.$inferInsert> = {},
  operation: Partial<typeof propertyOperations.$inferInsert> = {},
) {
  const id = nextId('8000');
  await db.insert(properties).values({
    id,
    code: `DEP${sequence}`,
    slug: `unidad-${sequence}`,
    title: `Unidad ${sequence}`,
    propertyType: 'apartment',
    status: 'available',
    publishedOnWeb: true,
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    developmentId,
    ...stamps,
    ...overrides,
  });
  await db.insert(propertyOperations).values({
    id: nextId('8001'),
    propertyId: id,
    operation: 'sale',
    priceCents: 12_000_000n,
    currency: 'USD',
    priceOnRequest: false,
    ...stamps,
    ...operation,
  });
  return id;
}

async function addPhoto(
  developmentId: string,
  overrides: Partial<typeof mediaItems.$inferInsert> = {},
) {
  const id = nextId('8003');
  await db.insert(mediaItems).values({
    id,
    developmentId,
    kind: 'photo',
    storageKey: `media/${id}`,
    url: `media/${id}`,
    variants: { web: `media/${id}/web` },
    uploadedBy: AUTHOR,
    ...stamps,
    ...overrides,
  });
  return id;
}

describe('DrizzlePublishedDevelopmentQuery', () => {
  it('lists the developments being marketed, without the trash', async () => {
    const shown = await insertDevelopment({ name: 'Torre Gurruchaga' });
    await insertDevelopment({ name: 'Cargando', status: 'loading' });
    await insertDevelopment({ name: 'Borrado', deletedAt: NOW, deletedBy: AUTHOR });

    const page = await query.search(BASE);

    expect(page.total).toBe(1);
    expect(page.items.map((d) => d.id)).toEqual([shown.id]);
  });

  it('pages and sorts without losing or repeating developments', async () => {
    for (let i = 0; i < 7; i++) {
      await insertDevelopment({
        deliveryDate: i % 3 === 0 ? null : `2027-${(9 - i).toString().padStart(2, '0')}-01`,
      });
    }
    const all = await query.search({ ...BASE, limit: 20 });
    const pages = [
      ...(await query.search({ ...BASE, limit: 3 })).items,
      ...(await query.search({ ...BASE, limit: 3, offset: 3 })).items,
      ...(await query.search({ ...BASE, limit: 3, offset: 6 })).items,
    ];
    expect(pages.map((d) => d.id)).toEqual(all.items.map((d) => d.id));
    // Los más nuevos primero.
    const created = all.items.map((d) => d.code);
    expect(created).toEqual([...created].sort().reverse());

    const byDelivery = (await query.search({ ...BASE, sort: 'delivery_asc', limit: 20 })).items;
    const dates = byDelivery.map((d) => d.deliveryDate);
    expect(dates.slice(0, 4)).toEqual(['2027-04-01', '2027-05-01', '2027-07-01', '2027-08-01']);
    expect(dates.slice(4)).toEqual([null, null, null]);
  });

  it('filters by type and construction status', async () => {
    const lots = await insertDevelopment({
      developmentType: 'lots',
      constructionStatus: 'pre_sale',
    });
    await insertDevelopment({ developmentType: 'lots', constructionStatus: 'finished' });
    await insertDevelopment({ developmentType: 'building', constructionStatus: 'pre_sale' });

    const page = await query.search({
      ...BASE,
      developmentType: 'lots',
      constructionStatus: 'pre_sale',
    });

    expect(page.items.map((d) => d.id)).toEqual([lots.id]);
    expect(page.total).toBe(1);
  });

  it('counts the listed units and takes the lowest visible sale price per currency', async () => {
    const development = await insertDevelopment();
    await insertUnit(development.id, {}, { priceCents: 15_000_000n });
    await insertUnit(development.id, {}, { priceCents: 9_500_000n });
    await insertUnit(development.id, {}, { priceCents: 80_000_000_000n, currency: 'ARS' });
    // No se cuentan ni cotizan: reservada, sin publicar, en la papelera.
    await insertUnit(development.id, { status: 'reserved' }, { priceCents: 100n });
    await insertUnit(development.id, { publishedOnWeb: false }, { priceCents: 100n });
    await insertUnit(development.id, { deletedAt: NOW, deletedBy: AUTHOR }, { priceCents: 100n });
    // Se cuentan pero no cotizan: precio oculto, a consultar o en alquiler.
    await insertUnit(development.id, { priceOnWeb: false }, { priceCents: 100n });
    await insertUnit(development.id, {}, { priceCents: 100n, priceOnRequest: true });
    await insertUnit(development.id, {}, { priceCents: 100n, operation: 'rent' });

    const [record] = (await query.search(BASE)).items;

    expect(record?.listedUnitCount).toBe(6);
    expect(
      [...(record?.unitPricesFrom ?? [])].sort((a, b) => a.currency.localeCompare(b.currency)),
    ).toEqual([
      { currency: 'ARS', amountCents: 80_000_000_000n },
      { currency: 'USD', amountCents: 9_500_000n },
    ]);
  });

  it('reads the public detail by slug, with location, features and gallery', async () => {
    const locationId = await insertLocationTree();
    const development = await insertDevelopment({
      slug: 'torre-gurruchaga',
      locationId,
      latitude: -34.5861,
      longitude: -58.4321,
      description: 'Torre de 12 pisos',
      deliveryDate: '2027-12-01',
      isFinanced: true,
    });
    const featureId = nextId('8002');
    await db.insert(features).values({
      id: featureId,
      kind: 'amenity',
      key: 'amenity-pileta',
      name: 'Pileta',
      position: 0,
      ...stamps,
    });
    await db
      .insert(developmentFeatures)
      .values({ developmentId: development.id, featureId, createdAt: NOW, createdBy: AUTHOR });
    const second = await addPhoto(development.id, { position: 1 });
    const cover = await addPhoto(development.id, { position: 2, isCover: true });

    const record = await query.findBySlug('torre-gurruchaga', LISTED);

    expect(record).toMatchObject({
      id: development.id,
      name: development.name,
      status: 'marketing',
      developmentType: 'building',
      deliveryDate: '2027-12-01',
      publishAddress: 'Gurruchaga al 1800',
      latitude: -34.5861,
      longitude: -58.4321,
      description: 'Torre de 12 pisos',
      isFinanced: true,
      features: [{ kind: 'amenity', name: 'Pileta' }],
      listedUnitCount: 0,
      unitPricesFrom: [],
      deletedAt: null,
    });
    expect(record?.locationPath).toEqual([
      { kind: 'country', name: 'Argentina' },
      { kind: 'province', name: 'Buenos Aires' },
      { kind: 'city', name: 'CABA' },
      { kind: 'neighborhood', name: 'Palermo' },
    ]);
    expect(record?.media.map((m) => m.id)).toEqual([cover, second]);
    // Nada privado: ni la dirección exacta ni el desarrollista.
    expect(
      JSON.stringify(record, (_, v: unknown) => (typeof v === 'bigint' ? `${v}` : v)),
    ).not.toMatch(/Gurruchaga 1834|Constructora Sur/);
  });

  it('finds hidden and trashed developments by slug, so the page can tell them apart', async () => {
    await insertDevelopment({ slug: 'cargando', status: 'loading' });
    await insertDevelopment({ slug: 'borrado', deletedAt: NOW, deletedBy: AUTHOR });

    expect(await query.findBySlug('cargando', LISTED)).toMatchObject({ status: 'loading' });
    expect((await query.findBySlug('borrado', LISTED))?.deletedAt).toEqual(NOW);
    expect(await query.findBySlug('no-existe', LISTED)).toBeUndefined();
  });

  it('finds the development that owns a photo, never a property', async () => {
    const development = await insertDevelopment();
    const photo = await addPhoto(development.id);
    const unit = await insertUnit(development.id);
    const unitPhoto = nextId('8003');
    await db.insert(mediaItems).values({
      id: unitPhoto,
      propertyId: unit,
      kind: 'photo',
      url: 'media/x',
      uploadedBy: AUTHOR,
      ...stamps,
    });

    expect((await query.findByMediaId(photo, LISTED))?.id).toBe(development.id);
    expect(await query.findByMediaId(unitPhoto, LISTED)).toBeUndefined();
  });

  it('pages with indexes for every filter and sort', async () => {
    const rows = Array.from({ length: 300 }, (_, n) => ({
      id: nextId('8006'),
      code: `IDX${n.toString().padStart(4, '0')}`,
      slug: `idx-${n}`,
      name: `Emprendimiento ${n}`,
      developmentType: (['building', 'lots', 'gated_community'] as const)[n % 3],
      status: n % 2 === 0 ? 'marketing' : 'loading',
      constructionStatus: n % 5 === 0 ? 'finished' : 'pre_sale',
      deliveryDate: n % 7 === 0 ? null : `2027-${((n % 12) + 1).toString().padStart(2, '0')}-01`,
      ...stamps,
      deletedAt: n % 10 === 9 ? NOW : null,
    }));
    await db.insert(developments).values(rows);

    const cases: PublishedDevelopmentCriteria[] = [
      BASE,
      { ...BASE, sort: 'delivery_asc' },
      { ...BASE, developmentType: 'lots' },
      { ...BASE, constructionStatus: 'finished' },
    ];
    for (const criteria of cases) {
      expect(scansWithIndex(await pagePlan(criteria)), JSON.stringify(criteria)).toBe(true);
    }
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

function scansWithIndex(nodes: readonly PlanNode[]): boolean {
  return !nodes.some((n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'developments');
}

/**
 * El plan de la consulta de la página, con `enable_seqscan = off`: Postgres solo recorre la tabla
 * entera si no tiene un índice que resuelva el filtro y el orden.
 */
async function pagePlan(criteria: PublishedDevelopmentCriteria): Promise<PlanNode[]> {
  const captured: { sql: string; params: unknown[] }[] = [];
  const pool = new pg.Pool({ connectionString: inject('databaseUrl'), max: 2 });
  try {
    const logged = drizzle(pool, {
      schema,
      logger: { logQuery: (statement, params) => captured.push({ sql: statement, params }) },
    });
    await new DrizzlePublishedDevelopmentQuery(logged).search(criteria);
    const page = captured.find((q) => /\blimit\b/i.test(q.sql) && q.sql.includes('"developments"'));
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
