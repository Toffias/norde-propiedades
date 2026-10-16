import { listingSource } from '@norde/core/portals/testing';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { ZonapropApi } from './zonaprop-api';
import {
  listingBody,
  listingCharacteristics,
  listingCode,
  listingProblems,
} from './zonaprop-listing';
import { ZonapropLocations } from './zonaprop-locations';
import { ZonapropPortalConnector } from './zonaprop-portal-connector';

// Respuestas con la forma de la API de Open Navent, con datos inventados.
const TOKEN = { access_token: 'tok-1234', token_type: 'bearer', expires_in: 3600 }; // gitleaks:allow
const LOCATION = [
  { id: 'V1-A-0', nombre: 'Argentina' },
  { id: 'V1-B-6', nombre: 'Capital Federal' },
  { id: 'V1-C-1003694', nombre: 'Palermo' },
];
const ONLINE = {
  idAviso: 1234567,
  codigoAviso: '0192000000007000800000000000a001',
  estado: 'ONLINE',
  informacion: [{ messageCode: 'I-PLS', messageText: 'SIMPLE' }],
  warnings: [],
  errors: [],
  error: false,
};
const NO_CREDITS = {
  idAviso: 1234567,
  estado: 'OFFLINE',
  errors: [
    { messageCode: 'ERR-0502', messageText: 'La empresa tiene utilizados todos sus disponibles' },
  ],
  error: true,
};
const OFFLINE = [{ ...ONLINE, estado: 'OFFLINE', errors: [] }];

const LISTING_ID = '01920000-0000-7000-8000-00000000a001';
const CODE = '0192000000007000800000000000a001';

function content(overrides: Parameters<typeof listingSource>[0] = {}) {
  return {
    listingId: LISTING_ID,
    source: listingSource({
      coordinates: { latitude: -34.5889, longitude: -58.4303 },
      address: 'Honduras 4500',
      description: 'Departamento luminoso de tres ambientes, con balcón y vista abierta al pulmón.',
      ...overrides,
    }),
    operation: undefined,
    listingType: 'simple',
    plan: 'SIMPLE',
  } as const;
}

function setup(
  responses: (() => Response | Promise<Response>)[],
  agencyCode: string | null = '17310373',
) {
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
    agencyCode: () => Promise.resolve(agencyCode ?? undefined),
    logger,
  });
  // Los pedidos al login no interesan en los tests del aviso.
  const calls = () =>
    requests.filter((r) => r.path !== '/v1/application/login').map((r) => `${r.method} ${r.path}`);
  return { connector, requests, calls };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

describe('Zonaprop listing mapping', () => {
  it('uses the listing id without hyphens as the listing code', () => {
    expect(listingCode(LISTING_ID)).toBe(CODE);
  });

  it('sends every priced operation in one listing, with the plan and the agency', () => {
    const body = listingBody(
      content({
        operations: [
          { operation: 'sale', currency: 'USD', priceCents: 12_000_000n, priceOnRequest: false },
          { operation: 'rent', currency: 'ARS', priceCents: 85_000_000n, priceOnRequest: false },
          {
            operation: 'temporary_rent',
            currency: 'USD',
            priceCents: undefined,
            priceOnRequest: true,
          },
        ],
      }),
      { agencyCode: '17310373', locationId: 'V1-C-1003694' },
    );

    expect(body).toMatchObject({
      codigoAviso: CODE,
      publicador: { codigoInmobiliaria: '17310373' },
      publicacion: { tipoDePublicacion: 'SIMPLE' },
      tipoDePropiedad: { idTipo: '2' },
      localizacion: {
        idUbicacion: 'V1-C-1003694',
        direccion: 'Honduras 4500',
        latitud: '-34.5889',
        longitud: '-58.4303',
        muestraMapa: 'EXACTO',
      },
      precios: [
        { operacion: 'VENTA', monto: '120000', moneda: 'USD' },
        { operacion: 'ALQUILER', monto: '850000', moneda: 'ARS' },
      ],
    });
  });

  it('shows only the area on the map without a published address', () => {
    const body = listingBody(content({ address: undefined }), {
      agencyCode: '1',
      locationId: 'V1-C-1',
    });
    expect(body.localizacion).not.toHaveProperty('direccion');
    expect(body.localizacion.muestraMapa).toBe('APROXIMADO');
  });

  it('maps galpón and depósito to their own Zonaprop types', () => {
    const ctx = { agencyCode: '1', locationId: 'V1-C-1' };
    expect(listingBody(content({ kind: 'warehouse' }), ctx).tipoDePropiedad.idTipo).toBe('8');
    expect(listingBody(content({ kind: 'storage' }), ctx).tipoDePropiedad.idTipo).toBe('45');
  });

  it('sends only the loaded characteristics, with the surface unit', () => {
    const source = listingSource({
      expensesCents: 9_500_000n,
      creditEligible: true,
      characteristics: {
        ...listingSource().characteristics,
        rooms: 3,
        bedrooms: 2,
        bathrooms: 1,
        toilets: undefined,
        parkingSpaces: undefined,
        ageYears: 10,
        orientation: 'northeast',
        disposition: 'front',
        isFurnished: false,
        professionalUse: true,
        surfaceTotalM2: 80,
        surfaceCoveredM2: 72.6,
      },
    });
    expect(listingCharacteristics(source)).toEqual([
      { id: 'CFT1', valor: '3' },
      { id: 'CFT2', valor: '2' },
      { id: 'CFT3', valor: '1' },
      { id: 'CFT5', valor: '10' },
      { id: 'CFT6', valor: '95000' },
      { id: 'CFT100', valor: '80' },
      { id: 'CFT101', valor: '73' },
      { id: 'CON1', idValor: 'M2' },
      { id: '1000029', idValor: '1000055' },
      { id: '1000019', idValor: '1000029' },
      { id: '1000001', idValor: '1' },
      { id: '1000004', idValor: '1' },
    ]);
  });

  it('uses the lot as the total surface of a land', () => {
    const source = listingSource({
      kind: 'land',
      characteristics: {
        ...listingSource().characteristics,
        surfaceTotalM2: undefined,
        surfaceCoveredM2: undefined,
        surfaceLandM2: 300,
      },
    });
    expect(listingCharacteristics(source)).toContainEqual({ id: 'CFT100', valor: '300' });
  });

  it('lists what is missing for Zonaprop', () => {
    expect(listingProblems(content())).toEqual([]);
    expect(
      listingProblems({
        ...content({ coordinates: undefined, description: 'Corta' }),
        plan: undefined,
      }),
    ).toEqual([
      'Elegí el plan de Zonaprop.',
      'Falta la ubicación en el mapa (latitud y longitud): Zonaprop la usa para ubicar la propiedad.',
      'Zonaprop pide una descripción de al menos 50 caracteres.',
    ]);
  });
});

describe('ZonapropPortalConnector', () => {
  it('creates the listing with its location and returns the listing code', async () => {
    const { connector, calls, requests } = setup([json(TOKEN), json(LOCATION), json(ONLINE)]);

    expect(unwrap(await connector.create('zonaprop', content()))).toEqual({
      externalId: CODE,
      permalink: undefined,
    });
    expect(calls()).toEqual([
      'GET /v1/ubicaciones/latitud/-34.58890/longitud/-58.43030/countrycode/AR',
      `PUT /v1/inmobiliarias/17310373/avisos/${CODE}`,
    ]);
    expect(requests.at(-1)?.body).toMatchObject({ localizacion: { idUbicacion: 'V1-C-1003694' } });
  });

  it('remembers the location of the same coordinates', async () => {
    const { connector, calls } = setup([json(TOKEN), json(LOCATION), json(ONLINE), json(ONLINE)]);
    unwrap(await connector.create('zonaprop', content()));
    unwrap(
      await connector.update('zonaprop', CODE, {
        content: content(),
        contentChanged: true,
        state: 'active',
      }),
    );
    expect(calls().filter((c) => c.startsWith('GET'))).toHaveLength(1);
  });

  it('explains a rejection without credits', async () => {
    const { connector } = setup([json(TOKEN), json(LOCATION), json(NO_CREDITS)]);
    expect(unwrapErr(await connector.create('zonaprop', content()))).toEqual({
      type: 'PortalRejected',
      reason:
        'Zonaprop rechazó el aviso: no quedan créditos de este plan. Elegí otro plan o cargá créditos.',
    });
  });

  it('passes on the messages of other rejections', async () => {
    const rejected = {
      errors: [{ messageCode: 'ERR-0203', messageText: 'El aviso no tiene una descripción.' }],
      error: true,
    };
    const { connector } = setup([json(TOKEN), json(LOCATION), json(rejected, 400)]);
    expect(unwrapErr(await connector.create('zonaprop', content()))).toEqual({
      type: 'PortalRejected',
      reason: 'Zonaprop rechazó el aviso: El aviso no tiene una descripción.',
    });
  });

  it('pauses by taking the listing offline', async () => {
    const { connector, calls } = setup([json(TOKEN), json(OFFLINE)]);
    expect(
      unwrap(
        await connector.update('zonaprop', CODE, {
          content: content(),
          contentChanged: true,
          state: 'paused',
        }),
      ),
    ).toBe('paused');
    expect(calls()).toEqual([`DELETE /v1/inmobiliarias/17310373/avisos/${CODE}`]);
  });

  it('resumes by sending the whole listing again', async () => {
    const { connector, calls } = setup([json(TOKEN), json(LOCATION), json(ONLINE)]);
    expect(
      unwrap(
        await connector.update('zonaprop', CODE, {
          content: content(),
          contentChanged: false,
          state: 'active',
        }),
      ),
    ).toBe('active');
    expect(calls().at(-1)).toBe(`PUT /v1/inmobiliarias/17310373/avisos/${CODE}`);
  });

  it('closes by taking the listing offline, and a missing one counts as closed', async () => {
    const { connector } = setup([
      json(TOKEN),
      json(OFFLINE),
      () => new Response(null, { status: 404 }),
    ]);
    unwrap(await connector.close('zonaprop', CODE));
    unwrap(await connector.close('zonaprop', CODE));
  });

  it('asks to reconnect without a connected agency', async () => {
    const { connector, requests } = setup([], null);
    expect(unwrapErr(await connector.create('zonaprop', content()))).toEqual({
      type: 'PortalCredentialsMissing',
    });
    expect(requests).toHaveLength(0);
  });

  it('rejects coordinates Zonaprop cannot place', async () => {
    const { connector } = setup([json(TOKEN), json([])]);
    expect(unwrapErr(await connector.create('zonaprop', content()))).toEqual({
      type: 'PortalRejected',
      reason: 'Zonaprop no encontró la ubicación de la propiedad: revisá la latitud y longitud.',
    });
  });

  it('retries later when Zonaprop does not answer', async () => {
    const { connector } = setup([
      json(TOKEN),
      json(LOCATION),
      () => new Response('down', { status: 503 }),
    ]);
    expect(unwrapErr(await connector.create('zonaprop', content()))).toEqual({
      type: 'PortalUnavailable',
    });
  });
});
