import { listingSource } from '@norde/core/portals/testing';
import { err, ok } from '@norde/core/shared';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import type { MercadoLibreLocations } from './mercadolibre-locations';
import { MercadoLibrePortalConnector } from './mercadolibre-portal-connector';

// Respuestas grabadas de la API de items de MercadoLibre, recortadas.
const CREATED = {
  id: 'MLA3879350706',
  permalink: 'https://departamento.mercadolibre.com.ar/MLA-3879350706-departamento-en-venta',
  status: 'active',
  listing_type_id: 'silver',
};
const ACTIVE_ITEM = { id: 'MLA3879350706', status: 'active', listing_type_id: 'silver' };
const CLOSED_ITEM = { ...ACTIVE_ITEM, status: 'closed' };
const PICTURE_REQUIRED = {
  message: 'Validation error',
  error: 'validation_error',
  status: 400,
  cause: [
    { code: 'item.pictures.required', message: 'Pictures are required for this listing type.' },
  ],
};

const TOKEN = 'APP_USR-test-access-token'; // gitleaks:allow
const CONTENT = { source: listingSource(), operation: 'sale', listingType: 'simple' } as const;

function setup(
  responses: (() => Response | Promise<Response>)[],
  options: { tokenMissing?: boolean; locationMissing?: boolean } = {},
) {
  const requests: { method: string; path: string; body: unknown; auth: string | undefined }[] = [];
  const logs: string[] = [];
  const logger: InfraLogger = {
    info: (details) => logs.push(JSON.stringify(details)),
    warn: (details) => logs.push(JSON.stringify(details)),
    error: (details) => logs.push(JSON.stringify(details)),
  };
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = (init?.headers ?? {}) as Record<string, string>; // RequestInit de prueba: siempre un objeto plano.
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: headers.Authorization,
    });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request ${url.pathname}`);
    return Promise.resolve(next());
  };
  const locations = {
    resolve: () =>
      Promise.resolve(
        options.locationMissing
          ? err({ type: 'LocationNotFound' as const, reason: 'No encontramos "Palermo".' })
          : ok({ neighborhood: { id: 'TUxBQlBBTDI1MTVa' } }),
      ),
  } as unknown as MercadoLibreLocations; // Solo se usa `resolve`.
  const connector = new MercadoLibrePortalConnector({
    tokens: {
      accessToken: () =>
        Promise.resolve(
          options.tokenMissing ? err({ type: 'PortalCredentialsMissing' as const }) : ok(TOKEN),
        ),
    },
    locations,
    logger,
    fetch: fakeFetch,
  });
  return { connector, requests, logs };
}

describe('MercadoLibrePortalConnector.create', () => {
  it('posts a classified with category, price, pictures, location and contact', async () => {
    const { connector, requests, logs } = setup([() => Response.json(CREATED, { status: 201 })]);

    const created = unwrap(await connector.create('mercadolibre', CONTENT));

    expect(created).toEqual({ externalId: CREATED.id, permalink: CREATED.permalink });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', path: '/items', auth: `Bearer ${TOKEN}` });
    expect(requests[0]?.body).toMatchObject({
      title: 'Departamento en venta en Palermo',
      category_id: 'MLA401686',
      price: 120_000,
      currency_id: 'USD',
      available_quantity: 1,
      buying_mode: 'classified',
      listing_type_id: 'silver',
      channels: ['marketplace'],
      pictures: [{ source: 'https://signed/1' }],
      description: { plain_text: 'Luminoso, al frente.' },
      location: {
        neighborhood: { id: 'TUxBQlBBTDI1MTVa' },
        address_line: 'Gurruchaga al 1800',
        latitude: -34.588,
        longitude: -58.43,
      },
      seller_contact: { country_code2: '54', phone2: '91166000000' },
    });
    // Ni el token ni los datos de contacto en los logs.
    expect(logs.join()).not.toContain('APP_USR');
    expect(logs.join()).not.toContain('91166000000');
  });

  it('publishes a featured listing as gold_premium', async () => {
    const { connector, requests } = setup([() => Response.json(CREATED, { status: 201 })]);
    unwrap(await connector.create('mercadolibre', { ...CONTENT, listingType: 'featured' }));
    expect(requests[0]?.body).toMatchObject({ listing_type_id: 'gold_premium' });
  });

  it('returns the reasons MercadoLibre gives for a rejection', async () => {
    const { connector } = setup([() => Response.json(PICTURE_REQUIRED, { status: 400 })]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalRejected',
      reason: 'MercadoLibre rechazó el aviso: Pictures are required for this listing type.',
    });
  });

  it('rejects a location MercadoLibre does not have, without posting', async () => {
    const { connector, requests } = setup([], { locationMissing: true });
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalRejected',
      reason: 'No encontramos "Palermo".',
    });
    expect(requests).toEqual([]);
  });

  it.each([429, 500, 503])('reports %i as unavailable', async (status) => {
    const { connector } = setup([() => Response.json({}, { status })]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalUnavailable',
    });
  });

  it('asks to reconnect on 401', async () => {
    const { connector } = setup([
      () => Response.json({ message: 'invalid_token' }, { status: 401 }),
    ]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalCredentialsMissing',
    });
  });

  it('asks to reconnect when there are no credentials', async () => {
    const { connector, requests } = setup([], { tokenMissing: true });
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalCredentialsMissing',
    });
    expect(requests).toEqual([]);
  });

  it('reports a network error as unavailable', async () => {
    const { connector } = setup([() => Promise.reject(new TypeError('fetch failed'))]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalUnavailable',
    });
  });
});

describe('MercadoLibrePortalConnector.update', () => {
  it('sends the content, the description and a new listing type, then the status', async () => {
    const { connector, requests } = setup([
      () => Response.json(ACTIVE_ITEM),
      () => Response.json(ACTIVE_ITEM),
      () => Response.json({ text: '', plain_text: 'Luminoso' }),
      () => Response.json({ ...ACTIVE_ITEM, listing_type_id: 'gold_premium' }),
      () => Response.json({ ...ACTIVE_ITEM, status: 'paused' }),
    ]);

    const state = unwrap(
      await connector.update('mercadolibre', 'MLA3879350706', {
        content: { ...CONTENT, listingType: 'featured' },
        state: 'paused',
      }),
    );

    expect(state).toBe('paused');
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /items/MLA3879350706',
      'PUT /items/MLA3879350706',
      'PUT /items/MLA3879350706/description',
      'POST /items/MLA3879350706/listing_type',
      'PUT /items/MLA3879350706',
    ]);
    expect(requests[3]?.body).toEqual({ id: 'gold_premium' });
    expect(requests[4]?.body).toEqual({ status: 'paused' });
  });

  it('only changes the status when there is no new content', async () => {
    const { connector, requests } = setup([
      () => Response.json({ ...ACTIVE_ITEM, status: 'paused' }),
      () => Response.json(ACTIVE_ITEM),
    ]);
    unwrap(
      await connector.update('mercadolibre', 'MLA3879350706', {
        content: undefined,
        state: 'active',
      }),
    );
    expect(requests.map((r) => r.method)).toEqual(['GET', 'PUT']);
    expect(requests[1]?.body).toEqual({ status: 'active' });
  });

  it('reports a listing MercadoLibre already closed', async () => {
    const { connector, requests } = setup([() => Response.json(CLOSED_ITEM)]);
    expect(
      unwrap(
        await connector.update('mercadolibre', 'MLA3879350706', {
          content: CONTENT,
          state: 'active',
        }),
      ),
    ).toBe('closed');
    expect(requests).toHaveLength(1);
  });
});

describe('MercadoLibrePortalConnector.close', () => {
  it('closes an active listing', async () => {
    const { connector, requests } = setup([
      () => Response.json(ACTIVE_ITEM),
      () => Response.json(CLOSED_ITEM),
    ]);
    unwrap(await connector.close('mercadolibre', 'MLA3879350706'));
    expect(requests[1]).toMatchObject({ method: 'PUT', body: { status: 'closed' } });
  });

  it('does nothing when it is already closed', async () => {
    const { connector, requests } = setup([() => Response.json(CLOSED_ITEM)]);
    unwrap(await connector.close('mercadolibre', 'MLA3879350706'));
    expect(requests).toHaveLength(1);
  });
});
