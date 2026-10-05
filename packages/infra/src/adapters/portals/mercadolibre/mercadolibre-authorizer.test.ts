import { createHash } from 'node:crypto';

import { FixedClock, unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { MercadoLibreAuthorizer } from './mercadolibre-authorizer';

// Respuestas grabadas de la API de MercadoLibre (POST /oauth/token y GET /users/me), con tokens
// inventados en el formato de ML.
const TOKEN = {
  access_token: 'APP_USR-test-access-token-1234567', // gitleaks:allow
  token_type: 'bearer',
  expires_in: 21600,
  scope: 'offline_access read write',
  user_id: 1234567,
  refresh_token: 'TG-test-refresh-token-1234567', // gitleaks:allow
};
const USER = { id: 1234567, nickname: 'NORDEPROPIEDADES', site_id: 'MLA' };
const INVALID_GRANT = {
  error: 'invalid_grant',
  error_description:
    'Error validating grant. Your authorization code or refresh token may be expired or it was already used',
  status: 400,
  cause: [],
};

const APP = {
  clientId: '5387223166827464',
  clientSecret: 'test-client-secret', // gitleaks:allow
  redirectUri: 'https://gestion.norde.test/api/portals/mercadolibre/callback',
};
const VERIFIER = 'v'.repeat(43);

function setup(responses: (() => Response | Promise<Response>)[], app: typeof APP | null = APP) {
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
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request');
    return Promise.resolve(next());
  };
  const authorizer = new MercadoLibreAuthorizer({
    app: app ?? undefined,
    clock: new FixedClock('2026-10-05T12:00:00Z'),
    logger,
    fetch: fakeFetch,
  });
  return { authorizer, requests, logs };
}

function bodyOf(init: RequestInit): URLSearchParams {
  return new URLSearchParams(typeof init.body === 'string' ? init.body : '');
}

describe('MercadoLibreAuthorizer.begin', () => {
  it('builds the authorization URL with PKCE S256', () => {
    const { authorizer } = setup([]);

    const request = unwrap(authorizer.begin('mercadolibre'));

    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe('https://auth.mercadolibre.com.ar/authorization');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: APP.clientId,
      redirect_uri: APP.redirectUri,
      state: request.state,
      code_challenge: createHash('sha256').update(request.codeVerifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    expect(request.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it('uses a new state and verifier each time', () => {
    const { authorizer } = setup([]);
    const first = unwrap(authorizer.begin('mercadolibre'));
    const second = unwrap(authorizer.begin('mercadolibre'));
    expect(first.state).not.toBe(second.state);
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
  });

  it('fails when the app is not configured', () => {
    const { authorizer } = setup([], null);
    expect(unwrapErr(authorizer.begin('mercadolibre'))).toEqual({ type: 'PortalNotConfigured' });
  });
});

describe('MercadoLibreAuthorizer.complete', () => {
  it('exchanges the code and reads the account', async () => {
    const { authorizer, requests, logs } = setup([
      () => Response.json(TOKEN),
      () => Response.json(USER),
    ]);

    const grant = unwrap(
      await authorizer.complete({
        portal: 'mercadolibre',
        code: 'TG-code',
        codeVerifier: VERIFIER,
      }),
    );

    expect(grant).toEqual({
      credentials: {
        accessToken: TOKEN.access_token,
        refreshToken: TOKEN.refresh_token,
        expiresAt: new Date('2026-10-05T18:00:00Z'),
      },
      externalAccountId: '1234567',
      accountName: 'NORDEPROPIEDADES',
    });
    expect(requests[0]?.url).toBe('https://api.mercadolibre.com/oauth/token');
    expect(Object.fromEntries(bodyOf(requests[0]!.init))).toEqual({
      grant_type: 'authorization_code',
      client_id: APP.clientId,
      client_secret: APP.clientSecret,
      code: 'TG-code',
      redirect_uri: APP.redirectUri,
      code_verifier: VERIFIER,
    });
    expect(requests[1]?.url).toBe('https://api.mercadolibre.com/users/me');
    expect(requests[1]?.init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN.access_token}`,
    });
    // Nunca tokens, códigos ni el secreto en los logs.
    const logged = logs.join();
    expect(logged).not.toContain('APP_USR');
    expect(logged).not.toContain('TG-');
    expect(logged).not.toContain(APP.clientSecret);
  });

  it('rejects an expired or used code', async () => {
    const { authorizer, logs } = setup([() => Response.json(INVALID_GRANT, { status: 400 })]);

    expect(
      unwrapErr(
        await authorizer.complete({
          portal: 'mercadolibre',
          code: 'TG-old',
          codeVerifier: VERIFIER,
        }),
      ),
    ).toEqual({ type: 'PortalAuthorizationRejected', reason: 'invalid_grant' });
    expect(logs.join()).toContain('invalid_grant');
  });

  it('rejects a grant without a refresh token', async () => {
    const { refresh_token: _omitted, ...withoutRefresh } = TOKEN;
    const { authorizer } = setup([() => Response.json(withoutRefresh)]);

    expect(
      unwrapErr(
        await authorizer.complete({
          portal: 'mercadolibre',
          code: 'TG-code',
          codeVerifier: VERIFIER,
        }),
      ).type,
    ).toBe('PortalAuthorizationRejected');
  });

  it.each([429, 500, 503])('reports %i as unavailable', async (status) => {
    const { authorizer } = setup([() => Response.json({}, { status })]);
    expect(
      unwrapErr(
        await authorizer.complete({
          portal: 'mercadolibre',
          code: 'TG-code',
          codeVerifier: VERIFIER,
        }),
      ),
    ).toEqual({ type: 'PortalUnavailable' });
  });

  it('reports a network error as unavailable', async () => {
    const { authorizer } = setup([() => Promise.reject(new TypeError('fetch failed'))]);
    expect(
      unwrapErr(
        await authorizer.complete({
          portal: 'mercadolibre',
          code: 'TG-code',
          codeVerifier: VERIFIER,
        }),
      ),
    ).toEqual({ type: 'PortalUnavailable' });
  });

  it('reports an unexpected response as unavailable', async () => {
    const { authorizer } = setup([() => Response.json({ access_token: 1 })]);
    expect(
      unwrapErr(
        await authorizer.complete({
          portal: 'mercadolibre',
          code: 'TG-code',
          codeVerifier: VERIFIER,
        }),
      ),
    ).toEqual({ type: 'PortalUnavailable' });
  });

  it('fails when the app is not configured', async () => {
    const { authorizer, requests } = setup([], null);
    expect(
      unwrapErr(
        await authorizer.complete({
          portal: 'mercadolibre',
          code: 'TG-code',
          codeVerifier: VERIFIER,
        }),
      ),
    ).toEqual({ type: 'PortalNotConfigured' });
    expect(requests).toHaveLength(0);
  });
});
