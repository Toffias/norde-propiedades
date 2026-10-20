import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import {
  PROPERTY_IMPORT_FIELD_LABELS,
  PROPERTY_IMPORT_FIELD_VALUES,
  PROPERTY_IMPORT_PROBLEM_CODE_VALUES,
  PROPERTY_IMPORT_WARNING_VALUES,
} from '../contracts';

import {
  MAX_PROPERTY_IMPORT_ROWS,
  PROPERTY_IMPORT_FIELDS,
  PROPERTY_IMPORT_PROBLEM_CODES,
  PROPERTY_IMPORT_WARNINGS,
  PropertyImport,
  TOKKO_PROPERTY_COLUMNS,
  tokkoColumns,
} from './property-import';
import {
  sameDevelopmentName,
  tokkoAddress,
  tokkoCount,
  tokkoDevelopmentName,
  tokkoExpensesCents,
  tokkoInternalComments,
  tokkoMeasure,
  tokkoPlace,
  tokkoPrice,
  tokkoPropertyKind,
} from './tokko-property';

describe('tokkoPropertyKind', () => {
  it('translates the Tokko types', () => {
    expect(tokkoPropertyKind('Departamento')).toBe('apartment');
    expect(tokkoPropertyKind('PH')).toBe('ph');
    expect(tokkoPropertyKind('Local')).toBe('commercial');
    expect(tokkoPropertyKind('Depósito')).toBe('storage');
    expect(tokkoPropertyKind('Cochera')).toBe('garage');
    expect(tokkoPropertyKind('Bóveda')).toBeUndefined();
  });
});

describe('tokkoPlace', () => {
  it('takes Capital Federal as CABA, with its neighborhood', () => {
    expect(tokkoPlace('Argentina', 'Capital Federal', 'Villa Luro')).toEqual({
      inCatalog: true,
      province: 'CABA',
      city: 'CABA',
      neighborhood: 'Villa Luro',
    });
  });

  it('puts a GBA locality under its partido, or takes it as the partido', () => {
    expect(tokkoPlace('Argentina', 'G.B.A. Zona Oeste', 'Ramos Mejia Norte')).toEqual({
      inCatalog: true,
      province: 'Buenos Aires',
      city: 'La Matanza',
      neighborhood: 'Ramos Mejia Norte',
    });
    expect(tokkoPlace('Argentina', 'Costa Atlantica', 'Pinamar Norte')).toMatchObject({
      city: 'Pinamar',
      neighborhood: 'Pinamar Norte',
    });
    expect(tokkoPlace('Argentina', 'G.B.A. Zona Sur', 'San Vicente')).toEqual({
      inCatalog: true,
      province: 'Buenos Aires',
      city: 'San Vicente',
      neighborhood: undefined,
    });
  });

  it('keeps another country or an unknown region as text', () => {
    expect(tokkoPlace('Uruguay', 'Montevideo', 'Nuevo París')).toEqual({
      inCatalog: false,
      province: 'Uruguay',
      city: 'Montevideo',
      neighborhood: 'Nuevo París',
    });
    expect(tokkoPlace('Argentina', 'Córdoba', 'Nueva Córdoba')).toMatchObject({
      inCatalog: false,
      province: 'Córdoba',
    });
  });
});

describe('tokkoPrice', () => {
  it('reads dollars and pesos with thousands separated by dots', () => {
    expect(tokkoPrice('USD 130.000')).toEqual({ currency: 'USD', cents: 13_000_000n });
    expect(tokkoPrice('$ 630.000')).toEqual({ currency: 'ARS', cents: 63_000_000n });
    expect(tokkoPrice('USD 1.250.000')).toEqual({ currency: 'USD', cents: 125_000_000n });
  });

  it('prefers dollars when there are two, and has no price for "-"', () => {
    expect(tokkoPrice('$ 9 | USD 120.000')).toEqual({ currency: 'USD', cents: 12_000_000n });
    expect(tokkoPrice('-')).toBeUndefined();
    expect(tokkoPrice('')).toBeUndefined();
    expect(tokkoPrice('Consultar')).toBeNull();
  });
});

describe('Tokko numbers', () => {
  it('reads measures, taking zero as no data', () => {
    expect(tokkoMeasure('300.00 m2')).toBe(300);
    expect(tokkoMeasure('8.66 m')).toBe(8.66);
    expect(tokkoMeasure('0.00 m2')).toBeUndefined();
    expect(tokkoMeasure('mucho')).toBeNull();
  });

  it('reads counts and expenses', () => {
    expect(tokkoCount('3')).toBe(3);
    expect(tokkoCount('0')).toBe(0);
    expect(tokkoCount('2,5')).toBeNull();
    expect(tokkoExpensesCents('60000')).toBe(6_000_000n);
    expect(tokkoExpensesCents('0')).toBeUndefined();
    expect(tokkoExpensesCents('$ 80.000')).toBe(8_000_000n);
    expect(tokkoExpensesCents('mucho')).toBeNull();
  });
});

describe('tokkoAddress', () => {
  it('splits the street, the number, the floor and the unit', () => {
    expect(tokkoAddress('Paso 1627')).toEqual({
      street: 'Paso',
      streetNumber: '1627',
      floor: undefined,
      unit: undefined,
    });
    expect(tokkoAddress('Cafayate 1581, PB')).toEqual({
      street: 'Cafayate',
      streetNumber: '1581',
      floor: 'PB',
      unit: undefined,
    });
    expect(tokkoAddress('Av. Rivadavia  9540 4º a')).toEqual({
      street: 'Av. Rivadavia',
      streetNumber: '9540',
      floor: '4',
      unit: 'A',
    });
    expect(tokkoAddress('Carlos María Herrera 954')).toMatchObject({
      street: 'Carlos María Herrera',
      streetNumber: '954',
    });
  });

  it('keeps what it cannot read', () => {
    expect(tokkoAddress('Ruta 2 km 45, lote 12')).toMatchObject({
      street: 'Ruta',
      streetNumber: '2',
      floor: 'km 45, lote 12',
    });
    expect(tokkoAddress('Barrio cerrado')).toEqual({
      street: 'Barrio cerrado',
      streetNumber: undefined,
      floor: undefined,
      unit: undefined,
    });
  });
});

describe('Tokko developments and internal data', () => {
  it('drops the construction status from the development name', () => {
    expect(tokkoDevelopmentName('AV. RIVADAVIA 9540  + EN POZO')).toBe('AV. RIVADAVIA 9540');
    expect(tokkoDevelopmentName('RAMÓN L. FALCÓN 6619')).toBe('RAMÓN L. FALCÓN 6619');
    expect(tokkoDevelopmentName('')).toBeUndefined();
    expect(sameDevelopmentName('Av. Rivadavia 9540', 'AV RIVADAVIA 9540')).toBe(true);
    expect(sameDevelopmentName('Ramon L. Falcon 6619', 'RAMÓN L. FALCÓN 6619')).toBe(true);
  });

  it('keeps what Norde does not model in the internal comments', () => {
    expect(
      tokkoInternalComments({
        floors: '2',
        occupation: 'Vacía ',
        zoning: '',
        uncoveredM2: 20.9,
      }),
    ).toBe('Datos de Tokko\nPlantas: 2\nOcupación: Vacía\nSuperficie descubierta: 20,9 m²');
    expect(
      tokkoInternalComments({
        floors: '0',
        occupation: '---',
        zoning: undefined,
        uncoveredM2: undefined,
      }),
    ).toBeUndefined();
  });
});

describe('PropertyImport', () => {
  const headers = Object.values(TOKKO_PROPERTY_COLUMNS);
  const id = parseId<'PropertyImport'>('00000000-0000-7000-8000-000000000001');
  if (id.isErr()) throw new Error('Invalid test id');
  const now = new Date('2026-10-20T12:00:00Z');
  const request = (input: { headers?: readonly string[]; rows?: number }) =>
    PropertyImport.request({
      id: id.value,
      fileName: 'Propiedades.csv',
      storageKey: 'imports/properties/1',
      headers: input.headers ?? headers,
      rows: input.rows ?? 2,
      requestedBy: 'u1',
      now,
    });

  it('recognizes the columns of the Tokko export without accents or case', () => {
    const columns = tokkoColumns(['REF', 'pais', 'Tipo de Propiedad', 'Direccion', 'Banos']);
    expect(columns.isOk() && columns.value).toEqual({
      code: 0,
      country: 1,
      propertyType: 2,
      address: 3,
      bathrooms: 4,
    });
  });

  it('is requested pending, with its columns, and announces it to the job', () => {
    const job = request({});
    if (job.isErr()) throw new Error(job.error.type);

    expect(job.value.status).toBe('pending');
    expect(job.value.columns.ownerPhone).toBe(headers.indexOf('Celular'));
    expect(job.value.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'properties.import_requested',
        payload: { importId: id.value },
      }),
    ]);
  });

  it('rejects a file that is not the Tokko export, an empty one or a too long one', () => {
    expect(request({ headers: ['Nombre', 'Celular'] })).toMatchObject({
      error: { type: 'NotATokkoExport', missing: ['Ref', 'Dirección', 'Tipo de propiedad'] },
    });
    expect(request({ rows: 0 })).toMatchObject({ error: { type: 'EmptyImportFile' } });
    expect(request({ rows: MAX_PROPERTY_IMPORT_ROWS + 1 })).toMatchObject({
      error: { type: 'TooManyImportRows' },
    });
  });

  it('counts each row and resumes after the processed ones', () => {
    const job = request({ rows: 3 });
    if (job.isErr()) throw new Error(job.error.type);
    job.value.start(now);
    job.value.recordRow('created', now);
    job.value.recordRow('existing', now);

    expect(job.value.wasProcessed(1)).toBe(true);
    expect(job.value.wasProcessed(2)).toBe(false);
    job.value.recordRow('failed', now);
    job.value.finish(now);
    expect(job.value.toSnapshot()).toMatchObject({
      status: 'done',
      totals: { rows: 3, processed: 3, created: 1, existing: 1, failed: 1 },
    });
    expect(job.value.start(now)).toMatchObject({ error: { type: 'ImportFinished' } });
  });
});

describe('property import contracts', () => {
  it('replicate the fields, problems and warnings of the domain', () => {
    expect([...PROPERTY_IMPORT_FIELD_VALUES]).toEqual([...PROPERTY_IMPORT_FIELDS]);
    expect(Object.values(PROPERTY_IMPORT_FIELD_LABELS)).toEqual(
      Object.values(TOKKO_PROPERTY_COLUMNS),
    );
    expect([...PROPERTY_IMPORT_PROBLEM_CODE_VALUES]).toEqual([...PROPERTY_IMPORT_PROBLEM_CODES]);
    expect([...PROPERTY_IMPORT_WARNING_VALUES]).toEqual([...PROPERTY_IMPORT_WARNINGS]);
  });
});
