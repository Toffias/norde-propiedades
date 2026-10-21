import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import {
  PROPERTY_IMPORT_FAILURE_VALUES,
  PROPERTY_IMPORT_FIELD_LABELS,
  PROPERTY_IMPORT_FIELD_VALUES,
  PROPERTY_IMPORT_PROBLEM_CODE_VALUES,
  PROPERTY_IMPORT_SOURCE_VALUES,
  PROPERTY_IMPORT_WARNING_VALUES,
} from '../contracts';

import {
  MAX_PROPERTY_IMPORT_ROWS,
  PROPERTY_IMPORT_FAILURES,
  PROPERTY_IMPORT_FIELDS,
  PROPERTY_IMPORT_PROBLEM_CODES,
  PROPERTY_IMPORT_SOURCES,
  PROPERTY_IMPORT_WARNINGS,
  PropertyImport,
  TOKKO_PROPERTY_COLUMNS,
  tokkoColumns,
} from './property-import';
import {
  sameDevelopmentName,
  tokkoAddress,
  tokkoApiPlace,
  tokkoConstructionStatus,
  tokkoDeliveryDate,
  tokkoDevelopmentKind,
  tokkoCount,
  tokkoDevelopmentName,
  tokkoExpensesCents,
  tokkoInternalComments,
  tokkoMeasure,
  tokkoPlace,
  tokkoPrice,
  tokkoPropertyKind,
  tokkoReferenceCode,
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
    // Tokko exporta "-1" en la antigüedad que no se cargó.
    expect(tokkoCount('-1')).toBeUndefined();
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

  it('reads the ways Tokko writes the floor and the unit', () => {
    const position = (raw: string) => {
      const { floor, unit } = tokkoAddress(`Av. Rivadavia 9540 ${raw}`);
      return [floor, unit];
    };
    expect(position('Piso 4 Departamento A')).toEqual(['4', 'A']);
    expect(position('Piso 2')).toEqual(['2', undefined]);
    expect(position('Planta Baja')).toEqual(['PB', undefined]);
    expect(position('PB 9')).toEqual(['PB', '9']);
    expect(position('3º UF 12')).toEqual(['3', '12']);
    expect(position('3 UF º 12')).toEqual(['3', '12']);
    expect(position('11ºD')).toEqual(['11', 'D']);
    expect(position('2°B')).toEqual(['2', 'B']);
    expect(position('Depto 9')).toEqual([undefined, '9']);
    expect(position('PB LOCAL')).toEqual(['PB', 'LOCAL']);
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

describe('tokkoReferenceCode', () => {
  it('replaces the spaces of a unit code with a dash', () => {
    expect(tokkoReferenceCode('NBU12345 AP1234567')).toBe('NBU12345-AP1234567');
    expect(tokkoReferenceCode(' nph285767 ')).toBe('NPH285767');
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

  it('is requested from the Tokko API without a file, and learns its rows when it starts', () => {
    const job = PropertyImport.requestFromTokkoApi({ id: id.value, requestedBy: 'u1', now });

    expect(job.toSnapshot()).toMatchObject({
      source: 'api',
      fileName: '',
      status: 'pending',
      totals: { rows: 0, processed: 0 },
    });
    expect(job.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'properties.tokko_api_import_requested',
        payload: { importId: id.value },
      }),
    ]);
    job.start(now);
    job.countRows(164, now);
    job.recordRow('completed', now);
    job.recordRow('existing', now);
    // Si en Tokko se borraron propiedades mientras corría, no quedan menos filas que las procesadas.
    job.countRows(1, now);
    expect(job.totals).toMatchObject({ rows: 2, processed: 2, completed: 1, existing: 1 });
  });
});

describe('property import contracts', () => {
  it('replicate the sources, failures, fields, problems and warnings of the domain', () => {
    expect([...PROPERTY_IMPORT_SOURCE_VALUES]).toEqual([...PROPERTY_IMPORT_SOURCES]);
    expect([...PROPERTY_IMPORT_FAILURE_VALUES]).toEqual([...PROPERTY_IMPORT_FAILURES]);
    expect([...PROPERTY_IMPORT_FIELD_VALUES]).toEqual([...PROPERTY_IMPORT_FIELDS]);
    expect(Object.values(PROPERTY_IMPORT_FIELD_LABELS)).toEqual(
      Object.values(TOKKO_PROPERTY_COLUMNS),
    );
    expect([...PROPERTY_IMPORT_PROBLEM_CODE_VALUES]).toEqual([...PROPERTY_IMPORT_PROBLEM_CODES]);
    expect([...PROPERTY_IMPORT_WARNING_VALUES]).toEqual([...PROPERTY_IMPORT_WARNINGS]);
  });
});

describe('tokkoApiPlace', () => {
  it('reads the partido from the API location chain', () => {
    expect(
      tokkoApiPlace('Argentina | G.B.A. Zona Oeste | La Matanza | Ramos Mejia | Ramos Mejia Sur'),
    ).toEqual({
      inCatalog: true,
      province: 'Buenos Aires',
      city: 'La Matanza',
      neighborhood: 'Ramos Mejia Sur',
    });
    expect(tokkoApiPlace('Argentina | G.B.A. Zona Norte | Tigre | Nordelta')).toMatchObject({
      city: 'Tigre',
      neighborhood: 'Nordelta',
    });
  });

  it('takes the last level as the neighborhood or the locality', () => {
    expect(tokkoApiPlace('Argentina | Capital Federal | Mataderos ')).toEqual({
      inCatalog: true,
      province: 'CABA',
      city: 'CABA',
      neighborhood: 'Mataderos',
    });
    expect(tokkoApiPlace('Argentina | G.B.A. Zona Sur | San Vicente ')).toMatchObject({
      city: 'San Vicente',
      neighborhood: undefined,
    });
    expect(tokkoApiPlace('Uruguay | Montevideo | Montevideo | Nuevo París')).toMatchObject({
      inCatalog: false,
      province: 'Uruguay',
      neighborhood: 'Nuevo París',
    });
  });
});

describe('Tokko developments', () => {
  it('translates the construction status numbers seen in the Norde portfolio', () => {
    expect(tokkoConstructionStatus(3)).toBe('pre_sale');
    expect(tokkoConstructionStatus(4)).toBe('under_construction');
    expect(tokkoConstructionStatus(6)).toBe('finished');
    expect(tokkoConstructionStatus(1)).toBeUndefined();
    expect(tokkoConstructionStatus(undefined)).toBeUndefined();
  });

  it('reads the delivery date, with or without time, and drops an impossible one', () => {
    expect(tokkoDeliveryDate('2028-12-01')).toBe('2028-12-01');
    expect(tokkoDeliveryDate('2028-02-29T00:00:00')).toBe('2028-02-29');
    expect(tokkoDeliveryDate('2026-02-29')).toBeUndefined();
    expect(tokkoDeliveryDate('2026-13-01')).toBeUndefined();
    expect(tokkoDeliveryDate('diciembre 2028')).toBeUndefined();
    expect(tokkoDeliveryDate(undefined)).toBeUndefined();
  });

  it('takes a Tokko building as a building, and anything else as other', () => {
    expect(tokkoDevelopmentKind('BU')).toBe('building');
    expect(tokkoDevelopmentKind('XX')).toBe('other');
  });

  it('drops the construction status Tokko adds to the name, with any spacing', () => {
    expect(tokkoDevelopmentName('Av. Rivadavia 9999 +   EN POZO')).toBe('Av. Rivadavia 9999');
    expect(tokkoDevelopmentName('RAMÓN L. FALCÓN 6619')).toBe('RAMÓN L. FALCÓN 6619');
  });
});

describe('PropertyImport developments', () => {
  it('counts the developments apart and starts them again after a cut', () => {
    const id = parseId<'PropertyImport'>('00000000-0000-7000-8000-000000000002');
    if (id.isErr()) throw new Error('Invalid test id');
    const now = new Date('2026-10-20T12:00:00Z');
    const job = PropertyImport.requestFromTokkoApi({ id: id.value, requestedBy: 'u1', now });

    expect(job.developmentsDone).toBe(false);
    job.recordDevelopment('created', now);
    job.recordDevelopment('failed', now);
    job.restartDevelopments(now);
    job.recordDevelopment('completed', now);
    job.finishDevelopments(now);
    expect(job.developmentsDone).toBe(true);
    expect(job.totals.developments).toEqual({ created: 0, existing: 0, completed: 1, failed: 0 });
  });
});
