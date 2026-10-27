import { developmentListingSource, listingSource } from '@norde/core/portals/testing';
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
const ME = { id: 534776711 };
/** `/users/me` y la búsqueda por `seller_custom_field`: el aviso todavía no se creó. */
const NOT_CREATED = [
  () => Response.json(ME),
  () => Response.json({ results: [], paging: { total: 0 } }),
];
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
const CONTENT = {
  kind: 'property',
  listingId: '01920000-0000-7000-8000-00000000a001',
  source: listingSource(),
  operation: 'sale',
  listingType: 'simple',
  plan: undefined,
} as const;

function setup(
  responses: (() => Response | Promise<Response>)[],
  options: { tokenMissing?: boolean; locationMissing?: boolean } = {},
) {
  const requests: {
    method: string;
    path: string;
    query: string;
    body: unknown;
    auth: string | undefined;
  }[] = [];
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
      query: url.searchParams.toString(),
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
    const { connector, requests, logs } = setup([
      ...NOT_CREATED,
      () => Response.json(CREATED, { status: 201 }),
    ]);

    const created = unwrap(await connector.create('mercadolibre', CONTENT));

    expect(created).toEqual({ externalId: CREATED.id, permalink: CREATED.permalink });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /users/me',
      'GET /users/534776711/items/search',
      'POST /items',
    ]);
    expect(requests[1]?.query).toBe(`seller_sku=${CONTENT.listingId}`);
    expect(requests[2]).toMatchObject({ method: 'POST', path: '/items', auth: `Bearer ${TOKEN}` });
    expect(requests[2]?.body).toMatchObject({
      seller_custom_field: CONTENT.listingId,
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
    const { connector, requests } = setup([
      ...NOT_CREATED,
      () => Response.json(CREATED, { status: 201 }),
    ]);
    unwrap(await connector.create('mercadolibre', { ...CONTENT, listingType: 'featured' }));
    expect(requests[2]?.body).toMatchObject({ listing_type_id: 'gold_premium' });
  });

  it('takes the item a previous attempt created instead of posting another', async () => {
    const { connector, requests } = setup([
      () => Response.json(ME),
      () => Response.json({ results: ['MLA3879350706'], paging: { total: 1 } }),
    ]);
    expect(unwrap(await connector.create('mercadolibre', CONTENT))).toEqual({
      externalId: 'MLA3879350706',
      permalink: undefined,
    });
    expect(requests.map((r) => r.method)).toEqual(['GET', 'GET']);
  });

  it('returns the reasons MercadoLibre gives for a rejection', async () => {
    const { connector } = setup([
      ...NOT_CREATED,
      () => Response.json(PICTURE_REQUIRED, { status: 400 }),
    ]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalRejected',
      reason: 'MercadoLibre rechazó el aviso: Pictures are required for this listing type.',
    });
  });

  it('explains a rejection MercadoLibre sends without a body, by its status', async () => {
    const { connector } = setup([...NOT_CREATED, () => new Response(null, { status: 402 })]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalRejected',
      reason:
        'MercadoLibre rechazó el aviso: la cuenta no tiene un paquete de publicaciones de inmuebles con cupo para este tipo de aviso (HTTP 402).',
    });
  });

  it('falls back to the error code, and then to the status alone', async () => {
    const { connector } = setup([
      ...NOT_CREATED,
      () => Response.json({ error: 'seller.unable_to_list', cause: [] }, { status: 400 }),
      ...NOT_CREATED,
      () => new Response(null, { status: 409 }),
    ]);
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalRejected',
      reason: 'MercadoLibre rechazó el aviso: seller.unable_to_list (HTTP 400).',
    });
    expect(unwrapErr(await connector.create('mercadolibre', CONTENT))).toEqual({
      type: 'PortalRejected',
      reason: 'MercadoLibre rechazó el aviso (HTTP 409).',
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
    const { connector } = setup([...NOT_CREATED, () => Response.json({}, { status })]);
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
    const { connector } = setup([
      ...NOT_CREATED,
      () => Promise.reject(new TypeError('fetch failed')),
    ]);
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
        contentChanged: true,
        state: 'paused',
      }),
    );

    expect(state).toEqual({ state: 'paused', permalink: undefined });
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

  it.each(['gold', 'gold_special', 'gold_premium'])(
    'keeps a featured item in %s as it is',
    async (listingType) => {
      const { connector, requests } = setup([
        () => Response.json({ ...ACTIVE_ITEM, listing_type_id: listingType }),
        () => Response.json(ACTIVE_ITEM),
        () => Response.json({ text: '', plain_text: 'Luminoso' }),
      ]);
      unwrap(
        await connector.update('mercadolibre', 'MLA3879350706', {
          content: { ...CONTENT, listingType: 'featured' },
          contentChanged: true,
          state: 'active',
        }),
      );
      expect(requests.map((r) => r.path)).not.toContain('/items/MLA3879350706/listing_type');
    },
  );

  it('moves a featured item to simple when the team asks for it', async () => {
    const { connector, requests } = setup([
      () => Response.json({ ...ACTIVE_ITEM, listing_type_id: 'gold' }),
      () => Response.json(ACTIVE_ITEM),
      () => Response.json({ text: '', plain_text: 'Luminoso' }),
      () => Response.json(ACTIVE_ITEM),
    ]);
    unwrap(
      await connector.update('mercadolibre', 'MLA3879350706', {
        content: CONTENT,
        contentChanged: true,
        state: 'active',
      }),
    );
    expect(requests[3]).toMatchObject({
      method: 'POST',
      path: '/items/MLA3879350706/listing_type',
      body: { id: 'silver' },
    });
  });

  it.each([
    [{ status: 'under_review' }, 'está revisando'],
    [{ status: 'inactive' }, 'inactivó'],
    [{ status: 'payment_required' }, 'espera un pago'],
    [{ status: 'paused', tags: ['moderation_penalty'] }, 'por moderación'],
  ])('does not try to activate an item MercadoLibre holds (%o)', async (remote, reason) => {
    const { connector, requests } = setup([() => Response.json({ ...ACTIVE_ITEM, ...remote })]);
    const update = unwrap(
      await connector.update('mercadolibre', 'MLA3879350706', {
        content: CONTENT,
        contentChanged: false,
        state: 'active',
      }),
    );
    expect(update).toMatchObject({ state: 'paused' });
    expect(update.reason).toContain(reason);
    expect(requests).toHaveLength(1);
  });

  it('only changes the status when there is no new content', async () => {
    const { connector, requests } = setup([
      () => Response.json({ ...ACTIVE_ITEM, status: 'paused' }),
      () => Response.json(ACTIVE_ITEM),
    ]);
    unwrap(
      await connector.update('mercadolibre', 'MLA3879350706', {
        content: CONTENT,
        contentChanged: false,
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
          contentChanged: true,
          state: 'active',
        }),
      ),
    ).toEqual({ state: 'closed', permalink: undefined });
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

const DEVELOPMENT = {
  kind: 'development',
  listingId: '01920000-0000-7000-8000-00000000a002',
  source: developmentListingSource({
    units: [
      listingSource({
        propertyId: '01920000-0000-7000-8000-0000000000e1',
        code: 'AP0001',
        unitDesignation: { floor: '3', unit: 'B' },
      }),
    ],
  }),
  listingType: 'simple',
  plan: undefined,
} as const;
const DEVELOPMENT_ITEM = {
  id: 'MLA843263657',
  status: 'active',
  listing_type_id: 'gold_premium',
  variations: [{ id: 52173477243, seller_custom_field: '01920000-0000-7000-8000-0000000000e1' }],
};
const DEVELOPMENT_PACKS = [
  {
    package_content: 'developments',
    status: 'active',
    listing_details: [{ listing_type_id: 'gold_premium', remaining_listings: 1 }],
  },
];

describe('MercadoLibrePortalConnector with developments', () => {
  it('reports what the development misses before calling', () => {
    const { connector } = setup([]);
    expect(
      connector.problems('mercadolibre_developments', {
        ...DEVELOPMENT,
        source: { ...DEVELOPMENT.source, stage: undefined },
      }),
    ).toEqual(['Falta la etapa de la obra (en pozo, en construcción o terminado).']);
  });

  it('publishes the development with the listing type of its package', async () => {
    const { connector, requests } = setup([
      ...NOT_CREATED,
      () => Response.json(DEVELOPMENT_PACKS),
      () => Response.json({ ...DEVELOPMENT_ITEM, permalink: 'https://x' }, { status: 201 }),
    ]);

    const created = unwrap(await connector.create('mercadolibre_developments', DEVELOPMENT));

    expect(created).toEqual({ externalId: 'MLA843263657', permalink: 'https://x' });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /users/me',
      'GET /users/534776711/items/search',
      'GET /users/534776711/classifieds_promotion_packs',
      'POST /items',
    ]);
    expect(requests[3]?.body).toMatchObject({
      seller_custom_field: DEVELOPMENT.listingId,
      category_id: 'MLA401806',
      listing_type_id: 'gold_premium',
      condition: 'new',
      buying_mode: 'classified',
      available_quantity: 1,
      currency_id: 'USD',
      location: { neighborhood: { id: 'TUxBQlBBTDI1MTVa' } },
      seller_contact: { country_code2: '54', phone2: '91166000000' },
      variations: [{ seller_custom_field: '01920000-0000-7000-8000-0000000000e1' }],
    });
  });

  it('does not post without a developments package with quota', async () => {
    const { connector, requests } = setup([...NOT_CREATED, () => Response.json([])]);
    const error = unwrapErr(await connector.create('mercadolibre_developments', DEVELOPMENT));
    expect(error).toMatchObject({ type: 'PortalRejected' });
    expect(requests).toHaveLength(3);
  });

  it('sends the variations with their IDs and the description, without a listing type change', async () => {
    const { connector, requests } = setup([
      () => Response.json(DEVELOPMENT_ITEM),
      () => Response.json(DEVELOPMENT_ITEM),
      () => Response.json({ plain_text: 'x' }),
    ]);

    unwrap(
      await connector.update('mercadolibre_developments', 'MLA843263657', {
        content: DEVELOPMENT,
        contentChanged: true,
        state: 'active',
      }),
    );

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /items/MLA843263657',
      'PUT /items/MLA843263657',
      'PUT /items/MLA843263657/description',
    ]);
    expect(requests[1]?.body).toMatchObject({
      variations: [{ id: 52173477243, price: 120_000 }],
    });
    expect(requests[1]?.body).not.toHaveProperty('price');
  });

  it('only pauses a development left without units: ML takes no listing without variations', async () => {
    const { connector, requests } = setup([
      () => Response.json(DEVELOPMENT_ITEM),
      () => Response.json({ ...DEVELOPMENT_ITEM, status: 'paused' }),
    ]);

    unwrap(
      await connector.update('mercadolibre_developments', 'MLA843263657', {
        content: { ...DEVELOPMENT, source: { ...DEVELOPMENT.source, units: [] } },
        contentChanged: true,
        state: 'paused',
      }),
    );

    expect(requests.map((r) => r.method)).toEqual(['GET', 'PUT']);
    expect(requests[1]?.body).toEqual({ status: 'paused' });
  });
});
