import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../shared/logger';

import { TokkoPropertyApi } from './tokko-property-api';

// Respuestas con la forma de `/api/v1/property/` de Tokko, con datos inventados. La key es falsa.
const API_KEY = 'tokko-test-key-0000'; // gitleaks:allow

const PROPERTY = {
  id: 1001,
  reference_code: 'NAP1001 AP2002',
  type: { id: 2, code: 'AP', name: 'Departamento' },
  address: 'Rivadavia 9540',
  real_address: 'Rivadavia 9540 4º A',
  fake_address: 'Rivadavia al 9500',
  floor: '4',
  apartment_door: 'A',
  location: { full_location: 'Argentina | Capital Federal | Villa Luro ', name: 'Villa Luro' },
  producer: { name: 'Micaela Santo', email: 'micaela@example.test' },
  operations: [
    {
      operation_id: 1,
      operation_type: 'Venta',
      prices: [{ currency: 'USD', price: 130000, period: 0, is_promotional: false }],
    },
  ],
  web_price: true,
  total_surface: '75.00',
  surface: '0.00',
  roofed_surface: '70.00',
  semiroofed_surface: '5.00',
  unroofed_surface: '0.00',
  front_measure: '0.00',
  depth_measure: '0.00',
  room_amount: 3,
  suite_amount: 2,
  bathroom_amount: 1,
  toilet_amount: 0,
  parking_lot_amount: 0,
  age: -1,
  expenses: 60000,
  floors_amount: 0,
  zonification: '',
  publication_title: 'Departamento en Villa Luro',
  description: 'Luminoso 3 ambientes.\n\nNorde Propiedades - Matrícula 0000',
  description_only: 'Luminoso 3 ambientes.',
  geo_lat: '-34.6385',
  geo_long: '-58.5021',
  internal_data: {
    internal_comments: 'Llaves en la oficina.',
    property_owners: [
      { name: 'Ana Prueba', cellphone: '', phone: '1144440000', email: 'ana@example.test' },
    ],
  },
  development: { id: 7, name: 'Torre Rivadavia' },
  photos: [
    {
      original: 'https://static.tokkobroker.com/original_pictures/1.jpg',
      image: 'https://static.tokkobroker.com/pictures/1.jpg',
      thumb: 'https://static.tokkobroker.com/thumbs/1.jpg',
      order: 0,
      is_front_cover: true,
      is_blueprint: false,
      description: null,
    },
  ],
};

const page = (objects: unknown[], total = objects.length) => ({
  meta: {
    limit: 20,
    offset: 0,
    total_count: total,
    next: `/api/v1/property/?key=${API_KEY}&offset=20`,
    previous: null,
  },
  objects,
});

function setup(responses: (() => Response | Promise<Response>)[]) {
  const requests: URL[] = [];
  const logs: string[] = [];
  const log = (details: object, message: string) =>
    logs.push(`${message} ${JSON.stringify(details)}`);
  const logger: InfraLogger = { info: log, warn: log, error: log };
  const fakeFetch: typeof fetch = (input) => {
    requests.push(new URL(input instanceof Request ? input.url : input.toString()));
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Promise.resolve(next());
  };
  const sleeps: number[] = [];
  const api = new TokkoPropertyApi({
    config: { apiKey: API_KEY },
    logger,
    fetch: fakeFetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
  return { api, requests, logs, sleeps };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

describe('TokkoPropertyApi.page', () => {
  it('reads a page of the property listing with the key, in Spanish', async () => {
    const { api, requests } = setup([json(page([PROPERTY], 164))]);

    const result = unwrap(await api.page(40, 20));

    const url = requests[0];
    expect(`${url?.origin ?? ''}${url?.pathname ?? ''}`).toBe(
      'https://www.tokkobroker.com/api/v1/property/',
    );
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      key: API_KEY,
      format: 'json',
      lang: 'es_ar',
      offset: '40',
      limit: '20',
    });
    expect(result.total).toBe(164);
    expect(result.properties).toEqual([
      {
        referenceCode: 'NAP1001 AP2002',
        typeName: 'Departamento',
        address: 'Rivadavia 9540 4º A',
        floor: '4',
        unit: 'A',
        fullLocation: 'Argentina | Capital Federal | Villa Luro ',
        producerName: 'Micaela Santo',
        operations: [{ operationId: 1, prices: [{ currency: 'USD', amount: 130000 }] }],
        showPrice: true,
        surfaceTotal: '75.00',
        surfaceLand: '0.00',
        surfaceCovered: '70.00',
        surfaceSemiCovered: '5.00',
        surfaceUncovered: '0.00',
        front: '0.00',
        depth: '0.00',
        rooms: 3,
        bedrooms: 2,
        bathrooms: 1,
        toilets: 0,
        parkingSpaces: 0,
        age: -1,
        expenses: 60000,
        floors: 0,
        zoning: undefined,
        title: 'Departamento en Villa Luro',
        description: 'Luminoso 3 ambientes.',
        internalComments: 'Llaves en la oficina.',
        latitude: -34.6385,
        longitude: -58.5021,
        owners: [{ name: 'Ana Prueba', phone: '1144440000', email: 'ana@example.test' }],
        developmentName: 'Torre Rivadavia',
        photos: [
          {
            url: 'https://static.tokkobroker.com/original_pictures/1.jpg',
            fallbackUrl: 'https://static.tokkobroker.com/pictures/1.jpg',
            order: 0,
            isCover: true,
            isFloorPlan: false,
          },
        ],
      },
    ]);
  });

  it('keeps a property it cannot read as an empty one, without logging its data', async () => {
    const { api, logs } = setup([json(page([{ reference_code: 42, photos: 'x' }]))]);

    const result = unwrap(await api.page(0, 20));

    expect(result.properties).toEqual([
      expect.objectContaining({ referenceCode: '', typeName: '', photos: [] }),
    ]);
    expect(logs.join('\n')).toContain('"position":1');
    expect(logs.join('\n')).not.toContain('42');
  });

  it('retries when Tokko does not answer, and never logs the key', async () => {
    const { api, logs, sleeps } = setup([
      () => new Response('busy', { status: 503 }),
      () => Promise.reject(new TypeError('fetch failed')),
      json(page([])),
    ]);

    expect(unwrap(await api.page(0, 20))).toEqual({ total: 0, properties: [] });
    expect(sleeps).toEqual([2_000, 5_000]);
    expect(logs.join('\n')).not.toContain(API_KEY);
  });

  it('gives up after the retries, and at once when the key is rejected', async () => {
    const busy = () => new Response('busy', { status: 503 });
    const down = setup([busy, busy, busy, busy]);
    expect(unwrapErr(await down.api.page(0, 20))).toEqual({ type: 'TokkoUnavailable' });
    expect(down.sleeps).toHaveLength(3);

    const rejected = setup([json({ error: 'Invalid key' }, 401)]);
    expect(unwrapErr(await rejected.api.page(0, 20))).toEqual({ type: 'TokkoUnavailable' });
    expect(rejected.sleeps).toEqual([]);
    expect(rejected.logs.join('\n')).not.toContain(API_KEY);

    const weird = setup([json({ objects: 'nope' })]);
    expect(unwrapErr(await weird.api.page(0, 20))).toEqual({ type: 'TokkoUnavailable' });
  });
});

describe('TokkoPropertyApi.photo', () => {
  const image = () =>
    new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
      headers: { 'content-type': 'image/jpeg; charset=binary', 'content-length': '3' },
    });

  it('downloads a photo from the Tokko servers', async () => {
    const { api } = setup([image]);

    const photo = unwrap(await api.photo('https://static.tokkobroker.com/original_pictures/1.jpg'));

    expect(photo.contentType).toBe('image/jpeg');
    expect([...photo.bytes]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('refuses another host, a failed download and a too big one', async () => {
    const { api, requests } = setup([
      () => new Response('missing', { status: 404 }),
      () =>
        new Response(new Uint8Array([1]), {
          headers: { 'content-type': 'image/jpeg', 'content-length': String(20 * 1024 * 1024) },
        }),
    ]);

    for (const url of [
      'https://evil.example.test/1.jpg',
      'http://static.tokkobroker.com/1.jpg',
      'https://user@static.tokkobroker.com/1.jpg',
      'no es una url',
    ]) {
      expect(unwrapErr(await api.photo(url))).toEqual({ type: 'PhotoUnavailable' });
    }
    expect(requests).toEqual([]);
    expect(unwrapErr(await api.photo('https://static.tokkobroker.com/2.jpg'))).toEqual({
      type: 'PhotoUnavailable',
    });
    expect(unwrapErr(await api.photo('https://static.tokkobroker.com/3.jpg'))).toEqual({
      type: 'PhotoUnavailable',
    });
  });
});
