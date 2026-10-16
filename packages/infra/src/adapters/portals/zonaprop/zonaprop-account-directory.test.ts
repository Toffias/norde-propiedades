import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { ZonapropAccountDirectory } from './zonaprop-account-directory';
import { ZonapropApi, type ZonapropApiConfig } from './zonaprop-api';

// Respuestas con la forma de la API de Open Navent (POST /v1/application/login,
// GET /v1/inmobiliarias y GET /v1/inmobiliarias/{codigo}/disponibilidad), con datos inventados.
const TOKEN = {
  access_token: 'caaa44ba-54bb-4398-93cd-04f9aed8f53b', // gitleaks:allow
  token_type: 'bearer',
  expires_in: 3600,
  scope: 'read write trust',
};
const AGENCIES = {
  number: 0,
  size: 2,
  total: 2,
  content: [
    { codigoInmobiliaria: '17310373', idNavplat: 30345987, nombre: 'Norde Propiedades' },
    { codigoInmobiliaria: 'otra', idNavplat: 30345989, nombre: 'Otra', bloqueada: true },
  ],
};
const AVAILABILITY = {
  disponibles: [
    { planDePublicacion: 'SIMPLE', cantidadDisponible: 40, cantidadContratado: 50 },
    { planDePublicacion: 'DESTACADO_COMBO', cantidadDisponible: 5 },
  ],
  vencimientos: [],
};

const CONFIG: ZonapropApiConfig = {
  baseUrl: 'https://api-zp.sandbox.test',
  clientId: 'NordeCRM',
  clientSecret: 'test-client-secret', // gitleaks:allow
};

function setup(
  responses: (() => Response | Promise<Response>)[],
  config: ZonapropApiConfig | null = CONFIG,
) {
  const requests: { url: string; init: RequestInit }[] = [];
  const logs: string[] = [];
  const logger: InfraLogger = {
    info: (details, message) => logs.push(`${message} ${JSON.stringify(details)}`),
    warn: (details, message) => logs.push(`${message} ${JSON.stringify(details)}`),
    error: (details, message) => logs.push(`${message} ${JSON.stringify(details)}`),
  };
  const fakeFetch: typeof fetch = (input, init) => {
    requests.push({
      url: input instanceof Request ? input.url : input.toString(),
      init: init ?? {},
    });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Promise.resolve(next());
  };
  let now = Date.parse('2026-10-16T12:00:00Z');
  const api = new ZonapropApi({
    config: config ?? undefined,
    logger,
    now: () => now,
    userAgent: 'NordeCRM/1.0 (soporte@norde.test)',
    fetch: fakeFetch,
  });
  const directory = new ZonapropAccountDirectory({ api, logger });
  return {
    directory,
    requests,
    logs,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

describe('ZonapropAccountDirectory.find', () => {
  it('logs in with the integrator credentials and finds the agency by its code', async () => {
    const { directory, requests } = setup([json(TOKEN), json(AGENCIES)]);

    expect(unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }))).toEqual({
      externalAccountId: '17310373',
      accountName: 'Norde Propiedades',
    });

    const login = new URL(requests[0]?.url ?? '');
    expect(requests[0]?.init.method).toBe('POST');
    expect(login.pathname).toBe('/v1/application/login');
    expect(Object.fromEntries(login.searchParams)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'NordeCRM',
      client_secret: 'test-client-secret',
    });
    const list = new URL(requests[1]?.url ?? '');
    expect(list.pathname).toBe('/v1/inmobiliarias');
    expect(list.searchParams.get('pageable.page')).toBe('0');
    // El token va en la URL: en el sandbox, `disponibilidad` no lee bien el header.
    expect(list.searchParams.get('access_token')).toBe(TOKEN.access_token);
    const headers = new Headers(requests[1]?.init.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('User-Agent')).toBe('NordeCRM/1.0 (soporte@norde.test)');
  });

  it('never logs the token or the secret', async () => {
    const { directory, logs } = setup([json(TOKEN), json(AGENCIES)]);
    unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }));
    expect(logs.join('\n')).not.toContain(TOKEN.access_token);
    expect(logs.join('\n')).not.toContain('test-client-secret');
  });

  it('logs only the error code when Zonaprop echoes the token back', async () => {
    // Open Navent repite el token en `error_description`.
    const rejected = () =>
      Response.json(
        {
          error: 'invalid_token',
          error_description: `Invalid access token: ${TOKEN.access_token}`,
        },
        { status: 401 },
      );
    const { directory, logs } = setup([json(TOKEN), rejected, json(TOKEN), rejected]);

    expect(unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: '1' }))).toEqual({
      type: 'PortalNotConfigured',
    });
    expect(logs.join('\n')).toContain('invalid_token');
    expect(logs.join('\n')).not.toContain(TOKEN.access_token);
  });

  it('reuses the token until it is about to expire', async () => {
    const { directory, requests, advance } = setup([
      json(TOKEN),
      json(AGENCIES),
      json(AGENCIES),
      json(TOKEN),
      json(AGENCIES),
    ]);
    unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }));
    unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }));
    advance(56 * 60_000);
    unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }));

    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      '/v1/application/login',
      '/v1/inmobiliarias',
      '/v1/inmobiliarias',
      '/v1/application/login',
      '/v1/inmobiliarias',
    ]);
  });

  it('logs in again once when Zonaprop rejects the token', async () => {
    const { directory, requests } = setup([
      json(TOKEN),
      () => new Response(null, { status: 401 }),
      json(TOKEN),
      json(AGENCIES),
    ]);
    unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }));
    expect(requests).toHaveLength(4);
  });

  it('reports a code that is not among the enabled agencies', async () => {
    const { directory } = setup([json(TOKEN), json(AGENCIES)]);
    expect(unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: '999' }))).toEqual({
      type: 'PortalAccountNotFound',
    });
  });

  it('reports no agencies at all (204) as not found', async () => {
    const { directory } = setup([json(TOKEN), () => new Response(null, { status: 204 })]);
    expect(
      unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: '17310373' })),
    ).toEqual({ type: 'PortalAccountNotFound' });
  });

  it('pages through the agencies', async () => {
    const first = {
      total: 51,
      content: Array.from({ length: 50 }, (_, i) => ({ codigoInmobiliaria: `x${String(i)}` })),
    };
    const second = { total: 51, content: [{ codigoInmobiliaria: '17310373', nombre: '' }] };
    const { directory, requests } = setup([json(TOKEN), json(first), json(second)]);

    expect(unwrap(await directory.find({ portal: 'zonaprop', accountCode: '17310373' }))).toEqual({
      externalAccountId: '17310373',
      accountName: '17310373',
    });
    expect(new URL(requests[2]?.url ?? '').searchParams.get('pageable.page')).toBe('1');
  });

  it('reports a blocked agency', async () => {
    const { directory } = setup([json(TOKEN), json(AGENCIES)]);
    expect(unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: 'otra' }))).toEqual({
      type: 'PortalAccountBlocked',
    });
  });

  it('is not configured without credentials', async () => {
    const { directory, requests } = setup([], null);
    expect(unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: '1' }))).toEqual({
      type: 'PortalNotConfigured',
    });
    expect(requests).toHaveLength(0);
  });

  it('reports rejected credentials as not configured', async () => {
    const { directory } = setup([
      () => Response.json({ error: 'invalid_client' }, { status: 401 }),
    ]);
    expect(unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: '1' }))).toEqual({
      type: 'PortalNotConfigured',
    });
  });

  it('reports a server error, a network error or an unexpected body as unavailable', async () => {
    for (const response of [
      () => new Response('down', { status: 503 }),
      () => Promise.reject(new TypeError('fetch failed')),
      json({ unexpected: true }),
    ]) {
      const { directory } = setup([json(TOKEN), response]);
      expect(unwrapErr(await directory.find({ portal: 'zonaprop', accountCode: '1' }))).toEqual({
        type: 'PortalUnavailable',
      });
    }
  });
});

describe('ZonapropAccountDirectory.credits', () => {
  it('reads the available credits by plan', async () => {
    const { directory, requests } = setup([json(TOKEN), json(AVAILABILITY)]);

    expect(
      unwrap(await directory.credits({ portal: 'zonaprop', externalAccountId: '17310373' })),
    ).toEqual([
      { plan: 'SIMPLE', available: 40, contracted: 50 },
      { plan: 'DESTACADO_COMBO', available: 5, contracted: undefined },
    ]);
    expect(new URL(requests[1]?.url ?? '').pathname).toBe(
      '/v1/inmobiliarias/17310373/disponibilidad',
    );
  });

  it('returns no credits when Zonaprop has none (204)', async () => {
    const { directory } = setup([json(TOKEN), () => new Response(null, { status: 204 })]);
    expect(
      unwrap(await directory.credits({ portal: 'zonaprop', externalAccountId: '17310373' })),
    ).toEqual([]);
  });

  it('reports an agency no longer associated to Norde as unavailable', async () => {
    const { directory, logs } = setup([json(TOKEN), () => new Response(null, { status: 403 })]);
    expect(
      unwrapErr(await directory.credits({ portal: 'zonaprop', externalAccountId: '17310373' })),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(logs.join('\n')).toContain('Zonaprop refused the agency credits');
  });
});
