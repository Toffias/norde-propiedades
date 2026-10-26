import type { BackgroundTaskCriteria } from '@norde/core/reporting';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import {
  developments,
  importJobs,
  mediaItems,
  opportunityBulkOperations,
  portalAccounts,
  portalListings,
  properties,
  propertyDocuments,
} from '../db/schema';

import { DrizzleBackgroundTaskQuery } from './drizzle-background-task-query';

const db = useTestDatabase();
const query = new DrizzleBackgroundTaskQuery(db);

const CAMILA = '00000000-0000-7000-8000-0000000000a1';
const NICOLAS = '00000000-0000-7000-8000-0000000000a2';
const BRANCH = '00000000-0000-7000-8000-0000000000b1';
const PROPERTY = '00000000-0000-7000-8000-0000000000d1';
const DEVELOPMENT = '00000000-0000-7000-8000-0000000000d2';
const NOW = new Date('2026-10-21T12:00:00Z');
const SINCE = new Date('2026-10-14T12:00:00Z');
const at = (iso: string) => new Date(`2026-10-${iso}Z`);

const id = (group: string, n: number) =>
  `00000000-0000-7000-${group}-${n.toString().padStart(12, '0')}`;

const MINE: BackgroundTaskCriteria = {
  requesterId: CAMILA,
  includePortals: false,
  finishedSince: SINCE,
};
const ALL: BackgroundTaskCriteria = {
  requesterId: undefined,
  includePortals: true,
  finishedSince: SINCE,
};
const PAGE = { direction: 'desc', offset: 0, limit: 50 } as const;

const stamps = (by: string, createdAt: Date, updatedAt = createdAt) => ({
  createdAt,
  updatedAt,
  createdBy: by,
  updatedBy: by,
});

async function seedOwners() {
  await db.insert(properties).values({
    id: PROPERTY,
    code: 'NOR001',
    slug: 'propiedad-1',
    title: 'Depto en Palermo',
    portalTitle: 'Depto luminoso en Palermo',
    propertyType: 'apartment',
    status: 'available',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'CABA',
    producerUserId: CAMILA,
    branchId: BRANCH,
    ...stamps(CAMILA, NOW),
  });
  await db.insert(developments).values({
    id: DEVELOPMENT,
    code: 'EMP001',
    slug: 'emp-1',
    name: 'Torre Norde',
    status: 'loading',
    producerUserId: CAMILA,
    branchId: BRANCH,
    ...stamps(CAMILA, NOW),
  });
}

function photo(
  n: number,
  values: Partial<typeof mediaItems.$inferInsert> & { readonly uploadedBy: string },
): typeof mediaItems.$inferInsert {
  return {
    id: id('e000', n),
    propertyId: PROPERTY,
    kind: 'photo',
    storageKey: `properties/${PROPERTY}/${String(n)}.jpg`,
    url: `properties/${PROPERTY}/${String(n)}.jpg`,
    position: n,
    processingStatus: 'ready',
    ...stamps(values.uploadedBy, at('21T10:00:00')),
    ...values,
  };
}

describe('DrizzleBackgroundTaskQuery', () => {
  it('groups the photos of each listing and who uploaded them, with their progress', async () => {
    await seedOwners();
    await db.insert(mediaItems).values([
      // Camila subió tres: una lista, una fallida y una procesándose.
      photo(1, { uploadedBy: CAMILA, updatedAt: at('21T10:01:00') }),
      photo(2, { uploadedBy: CAMILA, processingStatus: 'failed' }),
      photo(3, { uploadedBy: CAMILA, processingStatus: 'pending' }),
      // La importación de Tokko, todas listas.
      photo(4, { uploadedBy: 'system:import', updatedAt: at('21T11:00:00') }),
      photo(5, { uploadedBy: 'system:import', updatedAt: at('21T11:30:00') }),
      // Un video no se procesa; una foto vieja, rotada hace poco, sigue en curso.
      photo(6, { uploadedBy: CAMILA, kind: 'video' }),
      photo(7, {
        uploadedBy: NICOLAS,
        developmentId: DEVELOPMENT,
        propertyId: null,
        processingStatus: 'pending',
        createdAt: at('01T10:00:00'),
      }),
      // Subida hace un mes: ya no se muestra.
      photo(8, {
        uploadedBy: CAMILA,
        propertyId: null,
        developmentId: DEVELOPMENT,
        createdAt: at('01T10:00:00'),
      }),
    ]);

    const mine = await query.list(MINE, PAGE);

    expect(mine.items).toEqual([
      {
        id: `media_variants:${PROPERTY}:${CAMILA}`,
        kind: 'media_variants',
        sourceId: PROPERTY,
        status: 'running',
        subject: {
          kind: 'property',
          id: PROPERTY,
          code: 'NOR001',
          title: 'Depto luminoso en Palermo',
        },
        detail: undefined,
        progress: { done: 2, total: 3 },
        problems: 1,
        failure: undefined,
        requesterId: CAMILA,
        createdAt: at('21T10:00:00'),
        finishedAt: undefined,
      },
    ]);
    const all = await query.list(ALL, PAGE);
    expect(
      all.items.map((row) => [row.status, row.subject, row.requesterId, row.finishedAt]),
    ).toEqual([
      ['running', expect.objectContaining({ code: 'NOR001' }), CAMILA, undefined],
      [
        'running',
        { kind: 'development', id: DEVELOPMENT, name: 'Torre Norde' },
        NICOLAS,
        undefined,
      ],
      ['done', expect.objectContaining({ code: 'NOR001' }), 'system:import', at('21T11:30:00')],
    ]);
    expect(await query.countActive(ALL)).toBe(2);
  });

  it('groups the photos of an import under who asked for it, apart from each listing', async () => {
    await seedOwners();
    const IMPORT = id('f000', 9);
    const OLD_IMPORT = id('f000', 10);
    await db.insert(importJobs).values([
      {
        id: IMPORT,
        kind: 'properties_tokko',
        status: 'done',
        options: { columns: {}, source: 'api' },
        finishedAt: at('21T10:30:00'),
        ...stamps(CAMILA, at('21T09:00:00'), at('21T10:30:00')),
      },
      {
        id: OLD_IMPORT,
        kind: 'properties_tokko',
        status: 'done',
        options: { columns: {}, source: 'api' },
        finishedAt: at('01T10:30:00'),
        ...stamps(CAMILA, at('01T09:00:00'), at('01T10:30:00')),
      },
    ]);
    const imported = { uploadedBy: 'system:import', importId: IMPORT } as const;
    await db.insert(mediaItems).values([
      // Las fotos de la importación, en dos fichas: una lista, una fallida y una en espera.
      photo(1, { ...imported, updatedAt: at('21T10:05:00') }),
      photo(2, {
        ...imported,
        propertyId: null,
        developmentId: DEVELOPMENT,
        processingStatus: 'failed',
      }),
      photo(3, { ...imported, processingStatus: 'pending', createdAt: at('21T10:20:00') }),
      // La importación vieja ya terminó hace rato: no se muestra.
      photo(4, { uploadedBy: 'system:import', importId: OLD_IMPORT, createdAt: at('01T10:00:00') }),
    ]);

    const expected = {
      id: `import_media:${IMPORT}`,
      kind: 'import_media',
      sourceId: IMPORT,
      status: 'running',
      subject: undefined,
      detail: undefined,
      progress: { done: 2, total: 3 },
      problems: 1,
      failure: undefined,
      requesterId: CAMILA,
      createdAt: at('21T10:00:00'),
      finishedAt: undefined,
    };
    const mine = await query.list(MINE, PAGE);
    expect(mine.items.filter((row) => row.kind !== 'property_import')).toEqual([expected]);
    // Con el alcance de todos, tampoco aparecen sueltas por ficha.
    const all = await query.list(ALL, PAGE);
    expect(all.items.filter((row) => row.kind !== 'property_import')).toEqual([expected]);
    expect(await query.countActive(MINE)).toBe(1);
    expect(await query.list({ ...MINE, requesterId: NICOLAS }, PAGE)).toEqual({
      items: [],
      total: 0,
    });
  });

  it('lists the imports, bulk operations and documents of who asked for them', async () => {
    await seedOwners();
    await db.insert(importJobs).values([
      {
        id: id('f000', 1),
        kind: 'clients_xlsx',
        status: 'running',
        fileName: 'contactos.xlsx',
        totals: { rows: 2780, processed: 1200, created: 1100, duplicates: 90, failed: 10 },
        startedAt: at('21T11:00:00'),
        ...stamps(CAMILA, at('21T10:59:00'), at('21T11:40:00')),
      },
      {
        id: id('f000', 2),
        kind: 'properties_tokko',
        status: 'done',
        options: { columns: {}, source: 'api' },
        totals: { rows: 300, processed: 300, created: 290, existing: 0, completed: 0, failed: 10 },
        finishedAt: at('20T09:00:00'),
        ...stamps(CAMILA, at('20T08:00:00'), at('20T09:00:00')),
      },
      {
        id: id('f000', 3),
        kind: 'units_xlsx',
        status: 'failed',
        fileName: 'unidades.xlsx',
        options: { developmentId: DEVELOPMENT, mapping: {} },
        failure: 'unreadable_file',
        finishedAt: at('21T09:00:00'),
        ...stamps(CAMILA, at('21T08:59:00'), at('21T09:00:00')),
      },
      {
        id: id('f000', 4),
        kind: 'tokko_users',
        status: 'pending',
        ...stamps(NICOLAS, at('21T11:50:00')),
      },
      // Terminada antes de la semana: no se muestra.
      {
        id: id('f000', 5),
        kind: 'clients_xlsx',
        status: 'done',
        fileName: 'viejos.xlsx',
        finishedAt: at('01T09:00:00'),
        ...stamps(CAMILA, at('01T08:00:00'), at('01T09:00:00')),
      },
    ]);
    await db.insert(opportunityBulkOperations).values({
      id: id('f100', 1),
      action: { kind: 'change_stage', stageId: id('f200', 1) },
      selection: {},
      status: 'done',
      totals: { total: 40, processed: 40, updated: 38, unchanged: 0, skippedCount: 2, skipped: [] },
      requestedBy: CAMILA,
      finishedAt: at('21T10:30:00'),
      ...stamps(CAMILA, at('21T10:29:00'), at('21T10:30:00')),
    });
    await db.insert(propertyDocuments).values({
      id: id('f300', 1),
      propertyId: PROPERTY,
      kind: 'sheet',
      status: 'pending',
      requestedBy: CAMILA,
      ...stamps(CAMILA, at('21T11:55:00')),
    });

    const mine = await query.list(MINE, PAGE);

    expect(mine.total).toBe(5);
    expect(
      mine.items.map((row) => [row.kind, row.status, row.detail, row.progress, row.problems]),
    ).toEqual([
      // En curso primero, el más reciente arriba.
      ['property_document', 'running', 'sheet', undefined, 0],
      ['client_import', 'running', 'contactos.xlsx', { done: 1200, total: 2780 }, 10],
      ['opportunity_bulk', 'done', 'change_stage', { done: 40, total: 40 }, 2],
      ['unit_import', 'failed', 'unidades.xlsx', undefined, 0],
      ['property_import', 'done', 'api', { done: 300, total: 300 }, 10],
    ]);
    expect(mine.items[3]).toMatchObject({
      sourceId: id('f000', 3),
      failure: 'unreadable_file',
      subject: { kind: 'development', id: DEVELOPMENT, name: 'Torre Norde' },
      finishedAt: at('21T09:00:00'),
    });
    expect(await query.countActive(MINE)).toBe(2);
    const all = await query.list(ALL, PAGE);
    expect(all.items.map((row) => row.kind)).toContain('tokko_users_import');
    expect(await query.countActive(ALL)).toBe(3);
  });

  it('hides what finished before it was cleared, but never what is still running', async () => {
    await db.insert(importJobs).values([
      {
        id: id('f000', 1),
        kind: 'clients_xlsx',
        status: 'running',
        ...stamps(CAMILA, at('21T09:00:00'), at('21T09:30:00')),
      },
      {
        id: id('f000', 2),
        kind: 'clients_xlsx',
        status: 'done',
        finishedAt: at('21T10:00:00'),
        ...stamps(CAMILA, at('21T09:00:00'), at('21T10:00:00')),
      },
    ]);

    const cleared = await query.list({ ...MINE, finishedSince: at('21T11:00:00') }, PAGE);

    expect(cleared.items.map((row) => row.sourceId)).toEqual([id('f000', 1)]);
  });

  it('shows the portal listings only with everyone, with the error of the portal', async () => {
    await seedOwners();
    await db
      .insert(portalAccounts)
      .values({ portal: 'mercadolibre', ...stamps('system:import', NOW) });
    await db.insert(portalListings).values([
      {
        id: id('c100', 1),
        portal: 'mercadolibre',
        propertyId: PROPERTY,
        operation: 'sale',
        status: 'error',
        lastError: 'Faltan fotos.',
        lastSyncedAt: at('21T11:00:00'),
        ...stamps(CAMILA, at('10T10:00:00'), at('21T11:00:00')),
      },
      {
        id: id('c100', 2),
        portal: 'mercadolibre',
        propertyId: PROPERTY,
        operation: 'rent',
        status: 'pending',
        ...stamps('system:portal-sync', at('01T10:00:00')),
      },
    ]);

    expect((await query.list(MINE, PAGE)).total).toBe(0);
    const all = await query.list(ALL, PAGE);
    expect(all.items.map((row) => [row.status, row.detail, row.failure, row.finishedAt])).toEqual([
      ['running', 'mercadolibre', undefined, undefined],
      ['failed', 'mercadolibre', 'Faltan fotos.', at('21T11:00:00')],
    ]);
  });

  it('pages without losing or repeating tasks, in both directions', async () => {
    await db.insert(importJobs).values(
      Array.from({ length: 7 }, (_, n) => ({
        id: id('f000', n + 1),
        kind: 'clients_xlsx',
        status: n < 2 ? 'running' : 'done',
        finishedAt: n < 2 ? null : at(`21T0${String(n)}:00:00`),
        // Mismo momento para dos: desempata el ID.
        ...stamps(CAMILA, at('21T00:00:00'), at('21T09:00:00')),
      })),
    );

    for (const direction of ['asc', 'desc'] as const) {
      const pages = await Promise.all(
        [0, 3, 6].map((offset) => query.list(MINE, { direction, offset, limit: 3 })),
      );
      const ids = pages.flatMap((page) => page.items.map((row) => row.sourceId));
      expect(new Set(ids).size).toBe(7);
      expect(pages.map((page) => page.total)).toEqual([7, 7, 7]);
      // Los en curso van primero en los dos sentidos.
      expect(pages[0]?.items.slice(0, 2).every((row) => row.status === 'running')).toBe(true);
    }
  });
});
