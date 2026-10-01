import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../shared/logger';

import { NominatimGeocoder } from './nominatim-geocoder';

// Respuesta grabada de Nominatim (GET /search?format=jsonv2), recortada.
const FOUND = [
  {
    place_id: 287_412_345,
    lat: '-34.5871234',
    lon: '-58.4298765',
    category: 'place',
    type: 'house',
    display_name: 'Gurruchaga, Palermo, Buenos Aires, Argentina',
  },
];

const REQUEST = {
  street: 'Gurruchaga',
  streetNumber: '1834',
  neighborhood: 'Palermo',
  city: 'CABA',
  province: 'CABA',
};

function setup(response: () => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const logs: string[] = [];
  const logger: InfraLogger = {
    info: (details) => logs.push(JSON.stringify(details)),
    warn: (details) => logs.push(JSON.stringify(details)),
    error: (details) => logs.push(JSON.stringify(details)),
  };
  const fakeFetch: typeof fetch = (input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      init: init ?? {},
    });
    return Promise.resolve(response());
  };
  const geocoder = new NominatimGeocoder({
    userAgent: 'NordePropiedades/1.0 (test)',
    logger,
    fetch: fakeFetch,
  });
  return { geocoder, requests, logs };
}

describe('NominatimGeocoder', () => {
  it('searches the full address in Argentina and returns the first match', async () => {
    const { geocoder, requests } = setup(() => Response.json(FOUND));

    const result = await geocoder.locate(REQUEST);

    expect(result.isOk() && result.value).toEqual({
      latitude: -34.5871234,
      longitude: -58.4298765,
    });
    const url = new URL(requests[0]?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('Gurruchaga 1834, Palermo, CABA, CABA, Argentina');
    expect(url.searchParams.get('countrycodes')).toBe('ar');
    expect(new Headers(requests[0]?.init.headers).get('User-Agent')).toBe(
      'NordePropiedades/1.0 (test)',
    );
  });

  it('returns nothing when the address is not found', async () => {
    const { geocoder } = setup(() => Response.json([]));
    const result = await geocoder.locate({ ...REQUEST, streetNumber: undefined });
    expect(result.isOk() && result.value).toBeUndefined();
  });

  it('fails on an error status, an unexpected body or no connection, without logging the address', async () => {
    const rejected = setup(() => new Response('Too many requests', { status: 429 }));
    expect((await rejected.geocoder.locate(REQUEST)).isErr()).toBe(true);

    const garbage = setup(() => Response.json({ error: 'nope' }));
    expect((await garbage.geocoder.locate(REQUEST)).isErr()).toBe(true);

    const offline = setup(() => Promise.reject(new TypeError('fetch failed')));
    const result = await offline.geocoder.locate(REQUEST);
    expect(result.isErr() && result.error).toEqual({ type: 'GeocodingFailed' });

    for (const logs of [rejected.logs, garbage.logs, offline.logs]) {
      expect(logs.join(' ')).not.toContain('Gurruchaga');
    }
  });
});
