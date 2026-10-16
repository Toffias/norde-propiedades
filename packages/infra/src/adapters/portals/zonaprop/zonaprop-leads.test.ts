import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { ZonapropApi } from './zonaprop-api';
import { ZonapropLeads } from './zonaprop-leads';

// Respuestas con la forma de `/v2/inmobiliarias/{codigo}/mensajes` y de la configuración de
// callbacks, con datos inventados.
const TOKEN = { access_token: 'tok-1234', token_type: 'bearer', expires_in: 3600 }; // gitleaks:allow
const MESSAGES = {
  number: 0,
  size: 100,
  total: 3,
  content: [
    {
      id: 1,
      idMensaje: 236161673,
      idContacto: 991,
      idContactoAccion: 1,
      codigoAviso: '0192000000007000800000000000a001',
      idAvisoNavplat: 50044229,
      nombre: 'Juli',
      email: 'juli@example.test',
      telefono: '1165889654',
      textoMensaje: 'Hola, me interesa esta propiedad.',
      fecha: '2026-10-16T09:53:04.529-0300',
    },
    {
      id: 2,
      idMensaje: null,
      idContactoAccion: 10,
      codigoAviso: null,
      nombre: 'Martín',
      email: null,
      telefono: '+5491150001111',
      textoMensaje: null,
      fecha: 'no es una fecha',
    },
    { id: null, idMensaje: null, idContactoAccion: 6 },
  ],
};

function setup(responses: (() => Response | Promise<Response>)[]) {
  const requests: { method: string; url: URL; body: unknown }[] = [];
  const logs: string[] = [];
  const logger: InfraLogger = {
    info: (details, message) => logs.push(`${message} ${JSON.stringify(details)}`),
    warn: (details, message) => logs.push(`${message} ${JSON.stringify(details)}`),
    error: (details, message) => logs.push(`${message} ${JSON.stringify(details)}`),
  };
  const fakeFetch: typeof fetch = (input, init) => {
    requests.push({
      method: init?.method ?? 'GET',
      url: new URL(input instanceof Request ? input.url : input.toString()),
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
  return { leads: new ZonapropLeads({ api, logger }), requests, logs };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });
const RECENT = {
  portal: 'zonaprop',
  externalAccountId: '17310373',
  // 01:00 UTC del 15: todavía el 14 en Buenos Aires.
  since: new Date('2026-10-15T01:00:00Z'),
  offset: 100,
  limit: 100,
} as const;

describe('ZonapropLeads.recent', () => {
  it('reads a page of contacts since the date, in Buenos Aires time', async () => {
    const { leads, requests } = setup([json(TOKEN), json(MESSAGES)]);

    const page = unwrap(await leads.recent(RECENT));

    const url = requests.at(-1)?.url;
    expect(url?.pathname).toBe('/v2/inmobiliarias/17310373/mensajes');
    expect(url?.searchParams.get('fromDate')).toBe('20261014');
    expect(url?.searchParams.get('pageable.page')).toBe('1');
    expect(url?.searchParams.get('pageable.size')).toBe('100');
    expect(page.total).toBe(3);
    expect(page.items).toEqual([
      {
        externalId: '236161673',
        kind: 'message',
        receivedAt: new Date('2026-10-16T12:53:04.529Z'),
        name: 'Juli',
        email: 'juli@example.test',
        phone: '1165889654',
        message: 'Hola, me interesa esta propiedad.',
        listingCode: '0192000000007000800000000000a001',
      },
      {
        externalId: '2',
        kind: 'whatsapp',
        receivedAt: undefined,
        name: 'Martín',
        email: undefined,
        phone: '+5491150001111',
        message: undefined,
        listingCode: undefined,
      },
    ]);
  });

  it('never logs the contact data', async () => {
    const { leads, logs } = setup([json(TOKEN), json(MESSAGES)]);
    unwrap(await leads.recent(RECENT));
    const text = logs.join('\n');
    expect(text).not.toContain('juli@example.test');
    expect(text).not.toContain('1165889654');
  });

  it('reads no contacts (204) as an empty page', async () => {
    const { leads } = setup([json(TOKEN), () => new Response(null, { status: 204 })]);
    expect(unwrap(await leads.recent(RECENT))).toEqual({ items: [], total: 0 });
  });

  it('reports a portal that does not answer', async () => {
    const { leads } = setup([json(TOKEN), () => new Response('down', { status: 502 })]);
    expect(unwrapErr(await leads.recent(RECENT))).toEqual({ type: 'PortalUnavailable' });
  });
});

describe('ZonapropLeads.subscribe', () => {
  const TARGET = {
    portal: 'zonaprop',
    url: 'https://gestion.norde.test/api/webhooks/portals/zonaprop',
    headerName: 'x-norde-token',
    headerValue: 'secret-token-value',
  } as const;

  it('configures the callback URL and subscribes to the contact events', async () => {
    const { leads, requests } = setup([
      json(TOKEN),
      () => new Response(null, { status: 204 }),
      () => new Response('OK', { status: 200 }),
      () => new Response('OK', { status: 200 }),
    ]);

    unwrap(await leads.subscribe(TARGET));

    expect(requests.slice(1).map((r) => `${r.method} ${r.url.pathname}`)).toEqual([
      'PUT /v1/configuracion/callbacks',
      'PUT /v1/configuracion/callbacks/CONTACTO',
      'PUT /v1/configuracion/callbacks/CONTACTO_MENSAJE',
    ]);
    expect(requests[1]?.body).toEqual({
      url: TARGET.url,
      authorizationHeaderKey: 'x-norde-token',
      authorizationHeaderValue: 'secret-token-value',
      lenguajeCallbackBody: 'ES',
    });
  });

  it('stops at the first failure', async () => {
    const { leads, requests } = setup([json(TOKEN), () => new Response('down', { status: 503 })]);
    expect(unwrapErr(await leads.subscribe(TARGET))).toEqual({ type: 'PortalUnavailable' });
    expect(requests).toHaveLength(2);
  });
});
