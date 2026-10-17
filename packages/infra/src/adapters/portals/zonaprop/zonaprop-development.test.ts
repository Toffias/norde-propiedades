import {
  LISTED_UNIT_ID,
  developmentListingSource,
  listingSource,
} from '@norde/core/portals/testing';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { ZonapropApi } from './zonaprop-api';
import {
  deliveryMonth,
  developmentBody,
  developmentProblems,
  unitCode,
  unitPropertyId,
} from './zonaprop-development';
import { ZonapropLocations } from './zonaprop-locations';
import { ZonapropPortalConnector } from './zonaprop-portal-connector';

// Respuestas con la forma de la API de Open Navent, con datos inventados.
const TOKEN = { access_token: 'tok-1234', token_type: 'bearer', expires_in: 3600 }; // gitleaks:allow
const LOCATION = [
  { id: 'V1-A-0', nombre: 'Argentina' },
  { id: 'V1-B-6', nombre: 'Capital Federal' },
  { id: 'V1-C-1003704', nombre: 'Mataderos' },
];
const LISTING_ID = '01920000-0000-7000-8000-00000000a002';
const CODE = '0192000000007000800000000000a002';
const UNIT_CODE = 'U019200000000700080000000000000c1';

function content(overrides: Parameters<typeof developmentListingSource>[0] = {}) {
  return {
    kind: 'development',
    listingId: LISTING_ID,
    source: developmentListingSource(overrides),
    listingType: 'simple',
    plan: 'DESARROLLOS_HOME',
  } as const;
}

function setup(responses: (() => Response)[]) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const logger: InfraLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Promise.resolve(next());
  };
  const api = new ZonapropApi({
    config: { baseUrl: 'https://api-zp.sandbox.test', clientId: 'NordeCRM', clientSecret: 'x' },
    logger,
    now: () => Date.parse('2026-10-16T12:00:00Z'),
    userAgent: 'NordeGestion/test',
    fetch: fakeFetch,
  });
  const connector = new ZonapropPortalConnector({
    api,
    locations: new ZonapropLocations({ api }),
    agencyCode: () => Promise.resolve('17310373'),
    logger,
  });
  const calls = () =>
    requests.filter((r) => r.path !== '/v1/application/login').map((r) => `${r.method} ${r.path}`);
  return { connector, requests, calls };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

describe('Zonaprop development mapping', () => {
  it('codes each unit with its property, and reads the property back from the code', () => {
    expect(unitCode(LISTED_UNIT_ID)).toBe(UNIT_CODE);
    expect(unitPropertyId(UNIT_CODE)).toBe(LISTED_UNIT_ID);
    expect(unitPropertyId(CODE)).toBeUndefined();
    expect(unitPropertyId('DEV53838-NBU71286 AP8090293')).toBeUndefined();
  });

  it('sends the development with its stage, delivery month and every unit', () => {
    const body = developmentBody(content(), {
      agencyCode: '17310373',
      locationId: 'V1-C-1003704',
    });

    expect(body).toMatchObject({
      codigoAviso: CODE,
      publicador: { codigoInmobiliaria: '17310373', nombreDeContacto: 'Casa central' },
      publicacion: { tipoDePublicacion: 'DESARROLLOS_HOME' },
      titulo: 'Torre Mataderos',
      tipoDePropiedad: { idTipo: '34' },
      localizacion: { idUbicacion: 'V1-C-1003704', direccion: 'Murguiondo al 2000' },
      etapaDesarrollo: 'En Construcción',
      fechaEntrega: '12-2027',
      multimedia: { imagenes: [{ urlImagenOriginal: 'https://signed/r1' }] },
      claveReferencia: 'EMP0001',
    });
    expect(body.unidades).toEqual([
      expect.objectContaining({
        codigoAviso: UNIT_CODE,
        titulo: 'Departamento 2 ambientes con balcón',
        tipoDePropiedad: { idTipo: '2' },
        precios: [{ operacion: 'VENTA', monto: '120000', moneda: 'USD' }],
        claveReferencia: 'AP0001',
      }),
    ]);
    // La unidad sin descripción propia que alcance lleva la del emprendimiento.
    expect(body.unidades[0]?.descripcion).toBe(developmentListingSource().description);
  });

  it('separates vertical and horizontal developments', () => {
    const context = { agencyCode: '17310373', locationId: 'V1-C-1' };
    expect(developmentBody(content({ kind: 'gated_community' }), context).tipoDePropiedad).toEqual({
      idTipo: '33',
    });
    expect(developmentProblems(content({ kind: 'other' }))).toEqual([
      expect.stringContaining('verticales'),
    ]);
  });

  it('says what the development is missing', () => {
    expect(
      developmentProblems({
        ...content({
          coordinates: undefined,
          title: 'Torre',
          description: 'Corta.',
          stage: undefined,
          deliveryDate: undefined,
        }),
        plan: undefined,
      }),
    ).toEqual([
      'Elegí el plan de Zonaprop.',
      expect.stringContaining('latitud y longitud'),
      expect.stringContaining('título'),
      expect.stringContaining('descripción'),
      expect.stringContaining('etapa de la obra'),
      'Falta la fecha de entrega estimada.',
    ]);
    expect(developmentProblems(content())).toEqual([]);
  });

  it('writes the delivery date as month and year', () => {
    expect(deliveryMonth('2027-09-01')).toBe('09-2027');
  });
});

describe('ZonapropPortalConnector with developments', () => {
  it('puts the development with its units and keeps its link', async () => {
    const { connector, calls, requests } = setup([
      json(TOKEN),
      json(LOCATION),
      json([
        { idAviso: 59677897, codigoAviso: CODE, estado: 'PROCESADO', errors: [] },
        { idAviso: 59677898, codigoAviso: UNIT_CODE, codigoAvisoPadre: CODE, errors: [] },
      ]),
    ]);

    const created = unwrap(await connector.create('zonaprop', content()));

    expect(created).toEqual({
      externalId: CODE,
      permalink: 'https://www.zonaprop.com.ar/propiedades/clasificado/-59677897.html',
    });
    expect(calls()).toEqual([
      'GET /v1/ubicaciones/latitud/-34.65000/longitud/-58.50000/countrycode/AR',
      `PUT /v1/inmobiliarias/17310373/desarrollos/${CODE}`,
    ]);
    expect(requests.at(-1)?.body).toMatchObject({ unidades: [{ codigoAviso: UNIT_CODE }] });
  });

  it('rejects the development when a unit is rejected', async () => {
    const { connector } = setup([
      json(TOKEN),
      json(LOCATION),
      json([
        { idAviso: 59677897, codigoAviso: CODE, estado: 'PROCESADO', errors: [] },
        {
          codigoAviso: UNIT_CODE,
          errors: [{ messageCode: 'ERR-0101', messageText: 'Falta la superficie total.' }],
          error: true,
        },
      ]),
    ]);

    expect(unwrapErr(await connector.create('zonaprop', content()))).toEqual({
      type: 'PortalRejected',
      reason: 'Zonaprop rechazó el aviso: Falta la superficie total.',
    });
  });

  it('takes the development offline through its own resource', async () => {
    const { connector, calls } = setup([json(TOKEN), json([{ codigoAviso: CODE, errors: [] }])]);

    unwrap(await connector.close('zonaprop', CODE, 'development'));
    expect(calls()).toEqual([`DELETE /v1/inmobiliarias/17310373/desarrollos/${CODE}`]);
  });

  it('takes a development that is already offline as closed', async () => {
    const { connector } = setup([
      json(TOKEN),
      json(
        [
          {
            codigoAviso: CODE,
            errors: [
              {
                messageCode: 'ERR',
                messageText:
                  'Error al despublicar el aviso. {"code":"invalid_request","message":"El aviso 60,416,306 no esta online."}',
              },
            ],
          },
        ],
        400,
      ),
    ]);
    unwrap(await connector.close('zonaprop', CODE, 'development'));
  });

  it('pauses the development by taking it offline', async () => {
    const { connector, calls } = setup([json(TOKEN), json([{ codigoAviso: CODE, errors: [] }])]);

    const paused = unwrap(
      await connector.update('zonaprop', CODE, {
        content: content({ units: [] }),
        contentChanged: true,
        state: 'paused',
      }),
    );
    expect(paused.state).toBe('paused');
    expect(calls()).toEqual([`DELETE /v1/inmobiliarias/17310373/desarrollos/${CODE}`]);
  });

  it('uses the property checks for a property and the development checks for a development', () => {
    const { connector } = setup([]);
    expect(connector.problems('zonaprop', content({ stage: undefined }))).toEqual([
      'Falta la etapa de la obra (en pozo, en construcción o terminado).',
    ]);
    expect(
      connector.problems('zonaprop', {
        kind: 'property',
        listingId: LISTING_ID,
        source: listingSource({ description: 'Corta.' }),
        operation: undefined,
        listingType: 'simple',
        plan: 'SIMPLE',
      }),
    ).toEqual([expect.stringContaining('descripción')]);
  });
});
