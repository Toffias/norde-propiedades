import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { ZonapropApi } from './zonaprop-api';
import { ZonapropListingStates } from './zonaprop-listing-states';

// Respuestas con la forma de `/avisos/{codigoAviso}/status`, con datos inventados.
const TOKEN = { access_token: 'tok-1234', token_type: 'bearer', expires_in: 3600 }; // gitleaks:allow

function setup(responses: Record<string, () => Response>, connected = true) {
  const requested: string[] = [];
  const logger: InfraLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const fakeFetch: typeof fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === '/v1/application/login') return Promise.resolve(Response.json(TOKEN));
    requested.push(url.pathname);
    const respond = responses[url.pathname];
    if (!respond) throw new Error(`Unexpected request ${url.pathname}`);
    return Promise.resolve(respond());
  };
  const api = new ZonapropApi({
    config: { baseUrl: 'https://api-zp.sandbox.test', clientId: 'NordeCRM', clientSecret: 'x' },
    logger,
    now: () => Date.parse('2026-10-16T12:00:00Z'),
    userAgent: 'NordeGestion/test',
    fetch: fakeFetch,
  });
  const states = new ZonapropListingStates({
    api,
    agencyCode: () => Promise.resolve(connected ? '17310373' : undefined),
    logger,
  });
  return { states, requested };
}

const path = (code: string) => `/v1/inmobiliarias/17310373/avisos/${code}/status`;

describe('ZonapropListingStates', () => {
  it('reads online as active and offline as paused, with the permalink', async () => {
    const { states, requested } = setup({
      [path('a1')]: () => Response.json({ estado: 'ONLINE', idAvisoNavplat: 50044229 }),
      [path('a2')]: () =>
        Response.json({
          estado: 'OFFLINE',
          idAvisoNavplat: 50044230,
          errores: [{ messageText: 'Las fotos no se pudieron descargar.' }],
        }),
      [path('a3')]: () => Response.json({ estado: 'EN_ESPERA' }),
      [path('a4')]: () => new Response(null, { status: 404 }),
    });

    const read = unwrap(await states.states('zonaprop', ['a1', 'a2', 'a3', 'a4']));

    expect(requested).toEqual([path('a1'), path('a2'), path('a3'), path('a4')]);
    expect(read.get('a1')).toEqual({
      state: 'active',
      reason: undefined,
      permalink: 'https://www.zonaprop.com.ar/propiedades/clasificado/-50044229.html',
    });
    expect(read.get('a2')).toMatchObject({
      state: 'paused',
      permalink: 'https://www.zonaprop.com.ar/propiedades/clasificado/-50044230.html',
    });
    expect(read.get('a2')?.reason).toContain('Las fotos no se pudieron descargar.');
    // En espera o desconocido para Zonaprop: queda como estaba.
    expect(read.has('a3')).toBe(false);
    expect(read.has('a4')).toBe(false);
  });

  it('reports a portal that does not answer, or an account that is not connected', async () => {
    const down = setup({ [path('a1')]: () => new Response('down', { status: 502 }) });
    expect(unwrapErr(await down.states.states('zonaprop', ['a1']))).toEqual({
      type: 'PortalUnavailable',
    });
    const disconnected = setup({}, false);
    expect(unwrapErr(await disconnected.states.states('zonaprop', ['a1']))).toEqual({
      type: 'PortalCredentialsMissing',
    });
  });
});
