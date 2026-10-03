import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import { UNIT_IMPORT_FIELD_LABELS, UNIT_IMPORT_FIELD_VALUES } from '../contracts';

import {
  DevelopmentUnitImport,
  normalizeUnitDesignation,
  suggestUnitImportMapping,
  UNIT_IMPORT_FIELDS,
  unitDesignation,
  validateUnitImportMapping,
} from './development-unit-import';

const NOW = new Date('2026-10-03T12:00:00Z');
const ID = unwrap(parseId<'DevelopmentUnitImport'>('00000000-0000-7000-8000-0000000000d9'));

function request(overrides: Partial<Parameters<typeof DevelopmentUnitImport.request>[0]> = {}) {
  return DevelopmentUnitImport.request({
    id: ID,
    developmentId: '00000000-0000-7000-8000-0000000000e1',
    fileName: 'unidades.xlsx',
    storageKey: `imports/development-units/${ID}`,
    mapping: { floor: 0, unit: 1 },
    columnCount: 2,
    rows: 3,
    canMarkAvailable: true,
    requestedBy: 'user-1',
    now: NOW,
    ...overrides,
  });
}

describe('unit import mapping', () => {
  it('matches the contract fields', () => {
    expect([...UNIT_IMPORT_FIELDS]).toEqual([...UNIT_IMPORT_FIELD_VALUES]);
  });

  it('recognizes the headers of the units export, so an exported file imports as is', () => {
    const headers = UNIT_IMPORT_FIELDS.map((field) => UNIT_IMPORT_FIELD_LABELS[field]);

    expect(suggestUnitImportMapping(['Código', ...headers])).toEqual(
      Object.fromEntries(UNIT_IMPORT_FIELDS.map((field, index) => [field, index + 1])),
    );
  });

  it('recognizes a price list with its own headers', () => {
    expect(suggestUnitImportMapping(['PISO', 'Depto.', 'Ambientes', 'Precio', 'Moneda'])).toEqual({
      floor: 0,
      unit: 1,
      rooms: 2,
      salePrice: 3,
      saleCurrency: 4,
    });
  });

  it('needs a unit column, existing columns and no column twice', () => {
    expect(validateUnitImportMapping({ floor: 0, unit: 1 }, 2).isOk()).toBe(true);
    expect(unwrapErr(validateUnitImportMapping({ floor: 0 }, 2))).toEqual({
      type: 'InvalidUnitImportMapping',
      reason: 'missing_unit',
    });
    expect(unwrapErr(validateUnitImportMapping({ unit: 2 }, 2))).toMatchObject({
      reason: 'unknown_column',
    });
    expect(unwrapErr(validateUnitImportMapping({ unit: 0, floor: 0 }, 2))).toMatchObject({
      reason: 'repeated_column',
    });
  });
});

describe('unit designation', () => {
  it.each([
    ['4° A', '4A'],
    ['4 a', '4A'],
    ['P.B.', 'PB'],
    ['1º', '1'],
    ['Lote 12', 'LOTE12'],
    [undefined, ''],
  ])('normalizes %s as %s', (raw, expected) => {
    expect(normalizeUnitDesignation(raw)).toBe(expected);
  });

  it('keys a unit by its floor and unit', () => {
    expect(unitDesignation('4°', 'a')).toEqual(unitDesignation('4', 'A'));
    expect(unitDesignation(undefined, 'Lote 3')).toEqual({ floor: '', unit: 'LOTE3' });
  });
});

describe('DevelopmentUnitImport', () => {
  it('is requested pending, with an event for the job', () => {
    const job = unwrap(request());

    expect(job.status).toBe('pending');
    expect(job.totals).toEqual({
      rows: 3,
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
    });
    expect(job.pullEvents()).toEqual([
      {
        type: 'properties.unit_import_requested',
        aggregateId: ID,
        occurredAt: NOW,
        payload: { importId: ID, developmentId: '00000000-0000-7000-8000-0000000000e1' },
      },
    ]);
  });

  it('rejects an empty file, too many rows and a bad mapping', () => {
    expect(unwrapErr(request({ rows: 0 }))).toEqual({ type: 'EmptyImportFile' });
    expect(unwrapErr(request({ rows: 2001 }))).toEqual({ type: 'TooManyImportRows', max: 2000 });
    expect(unwrapErr(request({ mapping: { floor: 0 } }))).toMatchObject({
      type: 'InvalidUnitImportMapping',
    });
  });

  it('counts each row and resumes after the last processed one', () => {
    const job = unwrap(request());
    unwrap(job.start(NOW));
    job.recordRow('created', NOW);
    job.recordRow('updated', NOW);

    const resumed = DevelopmentUnitImport.restore(job.toSnapshot());
    expect(resumed.status).toBe('running');
    expect(resumed.wasProcessed(1)).toBe(true);
    expect(resumed.wasProcessed(2)).toBe(false);

    resumed.recordRow('failed', NOW);
    resumed.finish(NOW);
    expect(resumed.totals).toEqual({
      rows: 3,
      processed: 3,
      created: 1,
      updated: 1,
      unchanged: 0,
      failed: 1,
    });
    expect(unwrapErr(resumed.start(NOW))).toEqual({ type: 'ImportFinished' });
  });
});
