import { FakePortalListingCatalog } from '@norde/core/portals/testing';
import { err, ok } from '@norde/core/shared';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';
import { PortalListingCatalogsByProvider } from '../portal-listing-catalogs';

import { MercadoLibreListingCatalog } from './mercadolibre-listing-catalog';

// Respuestas de `/users/{id}/items/search` y del multiget de `/items`, recortadas. Los avisos son
// inventados, con la forma de los que publica Tokko.
const TOKEN = 'APP_USR-test-access-token'; // gitleaks:allow
const ACCOUNT = { portal: 'mercadolibre', externalAccountId: '3773207548' } as const;

function item(id: string, extra: object = {}) {
  return {
    code: 200,
    body: {
      id,
      title: 'PH 3 ambientes con patio',
      status: 'active',
      seller_id: 3773207548,
      category_id: 'MLA105182',
      listing_type_id: 'gold_premium',
      permalink: `https://inmueble.mercadolibre.com.ar/${id.replace('MLA', 'MLA-')}-venta-ph-_JM`,
      seller_custom_field: 'NPH456198',
      attributes: [{ id: 'OPERATION', value_name: 'Venta' }],
      location: { neighborhood: { name: 'Mataderos' }, city: { name: 'Capital Federal' } },
      ...extra,
    },
  };
}

function setup(responses: (() => Response)[], options: { tokenMissing?: boolean } = {}) {
  const requests: { path: string; query: URLSearchParams }[] = [];
  const logger: InfraLogger = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  const fakeFetch: typeof fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push({ path: url.pathname, query: url.searchParams });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request ${url.pathname}`);
    return Promise.resolve(next());
  };
  const catalog = new MercadoLibreListingCatalog({
    tokens: {
      accessToken: () =>
        Promise.resolve(
          options.tokenMissing ? err({ type: 'PortalCredentialsMissing' as const }) : ok(TOKEN),
        ),
    },
    logger,
    fetch: fakeFetch,
  });
  return { catalog, requests };
}

describe('MercadoLibreListingCatalog.online', () => {
  it('lists a page of the active items with their operation, type and reference', async () => {
    const { catalog, requests } = setup([
      () => Response.json({ results: ['MLA1', 'MLA2'], paging: { total: 179 } }),
      () =>
        Response.json([
          item('MLA1'),
          item('MLA2', {
            listing_type_id: 'silver',
            seller_custom_field: null,
            attributes: [
              { id: 'SELLER_SKU', value_name: 'NBU70377 AP7794303' },
              { id: 'OPERATION', value_name: 'Alquiler' },
            ],
          }),
        ]),
    ]);

    const page = unwrap(await catalog.online({ ...ACCOUNT, offset: 20, limit: 20 }));

    expect(page.total).toBe(179);
    expect(page.items).toEqual([
      {
        remoteId: 'MLA1',
        code: 'MLA1',
        reference: 'NPH456198',
        title: 'PH 3 ambientes con patio',
        operation: 'sale',
        listingType: 'featured',
        plan: undefined,
        location: 'Mataderos, Capital Federal',
        permalink: 'https://inmueble.mercadolibre.com.ar/MLA-1-venta-ph-_JM',
        isDevelopment: false,
      },
      expect.objectContaining({
        remoteId: 'MLA2',
        reference: 'AP7794303',
        operation: 'rent',
        listingType: 'simple',
      }),
    ]);
    expect(requests[0]?.path).toBe('/users/3773207548/items/search');
    expect(requests[0]?.query.get('status')).toBe('active');
    expect(requests[0]?.query.get('offset')).toBe('20');
    expect(requests[1]?.query.get('ids')).toBe('MLA1,MLA2');
  });

  it('takes the operation from the category when the item has no OPERATION attribute', async () => {
    const { catalog } = setup([
      () =>
        Response.json([
          item('MLA3', { attributes: [], category_id: 'MLA1473' }),
          item('MLA4', { attributes: [], category_id: 'MLA9999' }),
        ]),
    ]);
    const page = unwrap(
      await catalog.online({ ...ACCOUNT, offset: 0, limit: 1, remoteId: 'MLA3' }),
    );
    expect(page.items.map((r) => r.operation)).toEqual(['rent', undefined]);
  });

  it('finds one item only if it is of the account and still active or paused', async () => {
    const own = setup([() => Response.json([item('MLA1', { status: 'paused' })])]);
    expect(
      unwrap(await own.catalog.online({ ...ACCOUNT, offset: 0, limit: 1, remoteId: 'MLA1' })).items,
    ).toHaveLength(1);

    const other = setup([() => Response.json([item('MLA1', { seller_id: 1 })])]);
    expect(
      unwrap(await other.catalog.online({ ...ACCOUNT, offset: 0, limit: 1, remoteId: 'MLA1' }))
        .items,
    ).toEqual([]);

    const closed = setup([() => Response.json([item('MLA1', { status: 'closed' })])]);
    expect(
      unwrap(await closed.catalog.online({ ...ACCOUNT, offset: 0, limit: 1, remoteId: 'MLA1' }))
        .items,
    ).toEqual([]);

    const missing = setup([() => Response.json([{ code: 404, body: { message: 'not found' } }])]);
    expect(
      unwrap(await missing.catalog.online({ ...ACCOUNT, offset: 0, limit: 1, remoteId: 'MLA9' }))
        .items,
    ).toEqual([]);
  });

  it('reports MercadoLibre down, and not configured without credentials', async () => {
    const page = { ...ACCOUNT, offset: 0, limit: 20 };
    expect(
      unwrapErr(await setup([() => Response.json({}, { status: 503 })]).catalog.online(page)),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(
      unwrapErr(await setup([() => Response.json({ results: 1 })]).catalog.online(page)),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(unwrapErr(await setup([], { tokenMissing: true }).catalog.online(page))).toEqual({
      type: 'PortalNotConfigured',
    });
  });
});

describe('MercadoLibreListingCatalog.link', () => {
  it('keeps the item id as the publication id, without calling MercadoLibre', async () => {
    const { catalog, requests } = setup([]);
    expect(unwrap(await catalog.link({ ...ACCOUNT, remoteId: 'MLA1', listingId: 'l-1' }))).toEqual({
      externalId: 'MLA1',
      permalink: undefined,
    });
    expect(requests).toEqual([]);
  });

  it('does not link developments yet', async () => {
    const { catalog } = setup([]);
    expect(unwrap(await catalog.onlineDevelopments())).toEqual({ items: [], total: 0 });
    expect(unwrapErr(await catalog.linkDevelopment()).type).toBe('PortalRejected');
  });
});

describe('PortalListingCatalogsByProvider', () => {
  it('sends each portal to the catalog of its provider', async () => {
    const mercadolibre = new FakePortalListingCatalog();
    const zonaprop = new FakePortalListingCatalog();
    const catalog = new PortalListingCatalogsByProvider({ mercadolibre, zonaprop });
    const page = { externalAccountId: '1', offset: 0, limit: 10 };

    unwrap(await catalog.online({ ...page, portal: 'mercadolibre' }));
    unwrap(await catalog.onlineDevelopments({ ...page, portal: 'zonaprop' }));

    expect(mercadolibre.pages).toHaveLength(1);
    expect(zonaprop.pages).toHaveLength(1);
  });
});
