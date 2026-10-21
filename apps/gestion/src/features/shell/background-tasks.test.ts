import type { BackgroundTaskRow } from '@norde/core/reporting/contracts';
import { describe, expect, it } from 'vitest';

import {
  clearedUntil,
  formatProgress,
  parseClearedAt,
  taskFailure,
  taskHref,
  taskProblems,
  taskStatus,
  taskSubtitle,
  taskTitle,
} from './background-tasks';

const PROPERTY = { kind: 'property', id: 'p1', code: 'NOR001', title: 'Depto en Palermo' } as const;
const DEVELOPMENT = { kind: 'development', id: 'd1', name: 'Torre Norde' } as const;

function task(overrides: Partial<BackgroundTaskRow>): BackgroundTaskRow {
  return {
    id: 'import:i1',
    kind: 'client_import',
    sourceId: 'i1',
    status: 'running',
    subject: undefined,
    detail: 'contactos.xlsx',
    progress: undefined,
    problems: 0,
    failure: undefined,
    requester: undefined,
    createdAt: new Date('2026-10-21T10:00:00Z'),
    finishedAt: undefined,
    ...overrides,
  };
}

describe('background task display', () => {
  it('names each task and the listing or file it runs on', () => {
    expect(taskTitle(task({ kind: 'media_variants', subject: PROPERTY }))).toBe(
      'Generando variantes',
    );
    expect(taskStatus(task({ kind: 'media_variants' })).label).toBe('En curso');
    expect(taskStatus(task({})).label).toBe('Procesando');
    expect(taskSubtitle(task({ kind: 'media_variants', subject: PROPERTY }))).toBe(
      'NOR001 · Depto en Palermo',
    );
    expect(taskTitle(task({ kind: 'property_import', detail: 'api' }))).toBe(
      'Importación de propiedades desde Tokko',
    );
    expect(taskSubtitle(task({ kind: 'property_import', detail: 'api' }))).toBeUndefined();
    expect(taskSubtitle(task({}))).toBe('contactos.xlsx');
    expect(taskTitle(task({ kind: 'property_document', detail: 'showcase' }))).toBe(
      'PDF de vidriera',
    );
    expect(taskTitle(task({ kind: 'portal_listing', detail: 'zonaprop' }))).toBe(
      'Publicación en Zonaprop',
    );
    expect(taskTitle(task({ kind: 'opportunity_bulk', detail: 'reassign' }))).toBe(
      'Reasignación de oportunidades',
    );
  });

  it('formats the progress, the problems and why it failed', () => {
    expect(formatProgress({ done: 1200, total: 2780 })).toBe('1.200 de 2.780');
    expect(taskProblems(task({ problems: 3 }))).toBe('3 filas con problemas');
    expect(taskProblems(task({ kind: 'media_variants', problems: 1 }))).toBe('Una foto con error');
    expect(taskFailure(task({ status: 'failed', failure: 'unreadable_file' }))).toBe(
      'No se pudo leer el archivo.',
    );
    expect(taskFailure(task({ status: 'failed', failure: 'algo_nuevo' }))).toBe(
      'No se pudo terminar.',
    );
    expect(
      taskFailure(task({ kind: 'portal_listing', status: 'failed', failure: 'Faltan fotos.' })),
    ).toBe('Faltan fotos.');
    expect(taskFailure(task({ status: 'done' }))).toBeUndefined();
  });

  it('links to the import report, the listing or the pipeline', () => {
    expect(taskHref(task({}))).toBe('/contactos/importaciones?panel=i1');
    expect(taskHref(task({ kind: 'unit_import', subject: DEVELOPMENT }))).toBe(
      '/emprendimientos/d1/importaciones?panel=i1',
    );
    expect(taskHref(task({ kind: 'media_variants', subject: DEVELOPMENT }))).toBe(
      '/emprendimientos/d1?tab=multimedia',
    );
    expect(taskHref(task({ kind: 'property_document', subject: PROPERTY, status: 'done' }))).toBe(
      '/propiedades/p1/documentos/i1',
    );
    expect(taskHref(task({ kind: 'property_document', subject: PROPERTY }))).toBe(
      '/propiedades/p1?tab=detalles',
    );
    expect(taskHref(task({ kind: 'opportunity_bulk' }))).toBe('/oportunidades');
  });

  it('shows the photos of an import as one task, linked to its report', () => {
    const photos = task({ kind: 'import_media', detail: undefined, problems: 2 });
    expect(taskTitle(photos)).toBe('Fotos de la importación de Tokko');
    expect(taskStatus(photos).label).toBe('En curso');
    expect(taskSubtitle(photos)).toBeUndefined();
    expect(taskProblems(photos)).toBe('2 fotos con error');
    expect(taskFailure({ ...photos, status: 'failed' })).toBe(
      'No se pudieron generar las variantes de 2 fotos.',
    );
    expect(taskHref(photos)).toBe('/propiedades/importaciones?panel=i1');
  });

  it('clears up to the latest finished task', () => {
    const finished = new Date('2026-10-21T11:00:00Z');
    expect(clearedUntil([task({}), task({ status: 'done', finishedAt: finished })])).toBe(
      '2026-10-21T11:00:00.000Z',
    );
    expect(clearedUntil([task({})])).toBeUndefined();
  });

  it('reads only an ISO date from the cookie', () => {
    expect(parseClearedAt('2026-10-21T11:00:00.000Z')).toBe('2026-10-21T11:00:00.000Z');
    expect(parseClearedAt('ayer')).toBeUndefined();
    expect(parseClearedAt(undefined)).toBeUndefined();
  });
});
