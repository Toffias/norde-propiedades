import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { ZonapropApi } from './zonaprop-api';
import { ZonapropListingCatalog } from './zonaprop-listing-catalog';

// Respuestas con la forma de `/avisos/online/resumen` y `asociar`, con datos inventados.
const TOKEN = { access_token: 'tok-1234', token_type: 'bearer', expires_in: 3600 }; // gitleaks:allow
const SUMMARY = {
  number: 0,
  size: 2,
  total: 120,
  content: [
    {
      idAvisoNavplat: 50044229,
      codigoAviso: 'PRO3621230',
      idDesarrolloNavplat: null,
      tipoDeAviso: 'AVISO_CLASIFICADO',
      titulo: 'VENTA • MATADEROS • CASA 5 AMBIENTES',
      tipoDePublicacion: 'HOME',
      claveInterna: 'NHO1142594',
      ubicacion: {
        idUbicacion: 'V1-C-1003704',
        ubicacion: 'Mataderos, Capital Federal, Argentina',
      },
    },
    {
      idAvisoNavplat: 50044300,
      codigoAviso: null,
      idDesarrolloNavplat: 3018371426,
      tipoDeAviso: 'UNIDAD',
      titulo: '',
      tipoDePublicacion: null,
      claveInterna: ' ',
      ubicacion: null,
    },
  ],
};

const LISTING_ID = '01920000-0000-7000-8000-00000000a001';

function setup(responses: (() => Response | Promise<Response>)[]) {
  const requests: { method: string; url: URL }[] = [];
  const logger: InfraLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const fakeFetch: typeof fetch = (input, init) => {
    requests.push({
      method: init?.method ?? 'GET',
      url: new URL(input instanceof Request ? input.url : input.toString()),
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
  const catalog = new ZonapropListingCatalog({ api, logger });
  const last = () => requests.at(-1);
  return { catalog, last };
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });
const ONLINE = {
  portal: 'zonaprop',
  externalAccountId: '17310373',
  offset: 40,
  limit: 20,
} as const;

describe('ZonapropListingCatalog.online', () => {
  it('reads a page of the online listings, as Zonaprop pages them', async () => {
    const { catalog, last } = setup([json(TOKEN), json(SUMMARY)]);

    const page = unwrap(await catalog.online(ONLINE));

    expect(last()?.url.pathname).toBe('/v1/inmobiliarias/17310373/avisos/online/resumen');
    expect(last()?.url.searchParams.get('pageable.page')).toBe('2');
    expect(last()?.url.searchParams.get('pageable.size')).toBe('20');
    expect(page.total).toBe(120);
    expect(page.items).toEqual([
      {
        remoteId: '50044229',
        code: 'PRO3621230',
        reference: 'NHO1142594',
        title: 'VENTA • MATADEROS • CASA 5 AMBIENTES',
        plan: 'HOME',
        location: 'Mataderos, Capital Federal, Argentina',
        permalink: 'https://www.zonaprop.com.ar/propiedades/clasificado/-50044229.html',
        isDevelopment: false,
      },
      {
        remoteId: '50044300',
        code: undefined,
        reference: undefined,
        title: 'Aviso 50044300',
        plan: undefined,
        location: undefined,
        permalink: 'https://www.zonaprop.com.ar/propiedades/clasificado/-50044300.html',
        isDevelopment: true,
      },
    ]);
  });

  it('filters by the listing number', async () => {
    const { catalog, last } = setup([json(TOKEN), json({ total: 0, content: [] })]);
    unwrap(await catalog.online({ ...ONLINE, offset: 0, limit: 1, remoteId: '50044229' }));
    expect(last()?.url.searchParams.get('idAvisoNavplat')).toBe('50044229');
  });

  it('reads no listings (204) as an empty page', async () => {
    const { catalog } = setup([json(TOKEN), () => new Response(null, { status: 204 })]);
    expect(unwrap(await catalog.online(ONLINE))).toEqual({ items: [], total: 0 });
  });

  it('reports a portal that does not answer', async () => {
    const { catalog } = setup([json(TOKEN), () => new Response('down', { status: 503 })]);
    expect(unwrapErr(await catalog.online(ONLINE))).toEqual({ type: 'PortalUnavailable' });
  });
});

describe('ZonapropListingCatalog.link', () => {
  const LINK = {
    portal: 'zonaprop',
    externalAccountId: '17310373',
    remoteId: '50044229',
    listingId: LISTING_ID,
  } as const;

  it('associates the listing with the code of the Norde listing', async () => {
    const { catalog, last } = setup([
      json(TOKEN),
      json({ code: 'ok', respuesta: 'El aviso con id 50044229 se asocio.' }),
    ]);

    expect(unwrap(await catalog.link(LINK))).toEqual({
      externalId: '0192000000007000800000000000a001',
      permalink: 'https://www.zonaprop.com.ar/propiedades/clasificado/-50044229.html',
    });
    expect(last()?.method).toBe('PUT');
    expect(last()?.url.pathname).toBe(
      '/v1/inmobiliarias/17310373/avisos/0192000000007000800000000000a001/asociar/50044229',
    );
  });

  it('passes on a rejection', async () => {
    const { catalog } = setup([
      json(TOKEN),
      json({ code: 'error_inesperado', message: 'Access is denied' }),
    ]);
    expect(unwrapErr(await catalog.link(LINK))).toEqual({
      type: 'PortalRejected',
      reason: 'Zonaprop no vinculó el aviso: Access is denied',
    });
  });

  it('explains that linking needs a permission Zonaprop grants (403 no_permission)', async () => {
    const { catalog } = setup([
      json(TOKEN),
      json({ error: 'no_permission', error_description: 'Access is denied' }, 403),
    ]);
    const error = unwrapErr(await catalog.link(LINK));
    expect(error.type).toBe('PortalRejected');
    expect(error.type === 'PortalRejected' && error.reason).toContain('asociar avisos');
  });
});
