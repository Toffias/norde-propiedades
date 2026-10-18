import { err, ok } from '@norde/core/shared';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { MercadoLibreAccountReader } from './mercadolibre-account-reader';

// Respuestas de la API de MercadoLibre, recortadas a lo que se lee (ver la doc de "Gestionar
// paquetes de inmuebles", "Ciclo de vida de las publicaciones" y "Moderaciones con pausado").
const TOKEN = 'APP_USR-test-access-token'; // gitleaks:allow

function item(id: string, status: string, extra: { sub_status?: string[]; tags?: string[] } = {}) {
  return { code: 200, body: { id, status, sub_status: [], tags: [], ...extra } };
}

const PACKAGES = [
  {
    id: 754985,
    user_id: '3773207548',
    promotion_pack_id: 'MPAB',
    category_id: 'MLA1459',
    description: 'Paquete 15 Básico',
    package_type: 'rotary',
    package_content: 'publications',
    status: 'active',
    date_expires: '2026-11-22T15:34:47.544-04:00',
    remaining_listings: 12,
    used_listings: 3,
    listing_details: [
      {
        listing_type_id: 'silver',
        available_listings: 15,
        used_listings: 3,
        remaining_listings: 12,
      },
    ],
  },
  {
    id: 754986,
    description: 'Destaques Oro Premium',
    package_content: 'upgrades',
    status: 'active',
    date_expires: null,
    listing_details: [
      { listing_type_id: 'gold_premium', available_listings: 5, remaining_listings: 5 },
    ],
  },
  {
    id: 754987,
    description: 'Ilimitado',
    package_content: 'publications',
    status: 'active',
    listing_details: [{ listing_type_id: 'silver', available_listings: null }],
  },
  { id: 1, description: 'Vencido', package_content: 'publications', status: 'finished' },
];

function setup(responses: (() => Response)[], options: { tokenMissing?: boolean } = {}) {
  const requests: { path: string; query: URLSearchParams; auth: string | undefined }[] = [];
  const logs: string[] = [];
  const logger: InfraLogger = {
    info: (details) => logs.push(JSON.stringify(details)),
    warn: (details) => logs.push(JSON.stringify(details)),
    error: (details) => logs.push(JSON.stringify(details)),
  };
  const fakeFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const headers = (init?.headers ?? {}) as Record<string, string>; // RequestInit de prueba: siempre un objeto plano.
    requests.push({ path: url.pathname, query: url.searchParams, auth: headers.Authorization });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request ${url.pathname}`);
    return Promise.resolve(next());
  };
  const reader = new MercadoLibreAccountReader({
    tokens: {
      accessToken: () =>
        Promise.resolve(
          options.tokenMissing ? err({ type: 'PortalCredentialsMissing' as const }) : ok(TOKEN),
        ),
    },
    logger,
    fetch: fakeFetch,
  });
  return { reader, requests, logs };
}

describe('MercadoLibreAccountReader.states', () => {
  it('maps active, expired, deleted and missing listings', async () => {
    const { reader, requests } = setup([
      () =>
        Response.json([
          item('MLA1', 'active'),
          item('MLA2', 'closed', { sub_status: ['expired'] }),
          item('MLA3', 'closed', { sub_status: ['deleted'] }),
          { code: 404, body: { message: 'Item with id MLA4 not found' } },
        ]),
    ]);

    const states = unwrap(await reader.states('mercadolibre', ['MLA1', 'MLA2', 'MLA3', 'MLA4']));

    expect(Object.fromEntries(states)).toEqual({
      MLA1: { state: 'active', reason: undefined },
      MLA2: { state: 'closed', reason: 'MercadoLibre venció el aviso: terminó su vigencia.' },
      MLA3: { state: 'closed', reason: 'El aviso se borró en MercadoLibre.' },
      MLA4: { state: 'closed', reason: 'El aviso ya no existe en MercadoLibre.' },
    });
    expect(requests[0]?.path).toBe('/items');
    expect(requests[0]?.query.get('ids')).toBe('MLA1,MLA2,MLA3,MLA4');
    expect(requests[0]?.query.get('attributes')).toBe('id,status,sub_status,tags');
    expect(requests[0]?.auth).toBe(`Bearer ${TOKEN}`);
  });

  it('reads the moderation reason of a listing paused or under review by MercadoLibre', async () => {
    const { reader, requests } = setup([
      () =>
        Response.json([
          item('MLA1', 'paused', { tags: ['moderation_penalty'] }),
          item('MLA2', 'under_review', { sub_status: ['forbidden'] }),
        ]),
      () =>
        Response.json([
          {
            name: 'ABANDONED_ITEM_REX_DEN',
            wordings: [
              { type: 'REASON', value: 'Reportada como no disponible.' },
              { type: 'REMEDY', value: 'Reactivala desde el listado.' },
            ],
          },
        ]),
      () => Response.json({ message: 'boom' }, { status: 500 }),
    ]);

    const states = unwrap(await reader.states('mercadolibre', ['MLA1', 'MLA2']));

    expect(Object.fromEntries(states)).toEqual({
      MLA1: {
        state: 'paused',
        reason: 'MercadoLibre pausó el aviso: Reportada como no disponible.',
      },
      MLA2: {
        state: 'paused',
        reason:
          'MercadoLibre está revisando el aviso por moderación. Revisalo en la cuenta de MercadoLibre.',
      },
    });
    expect(requests.map((r) => r.path)).toEqual([
      '/items',
      '/moderations/last_moderation/MLA1-ITM',
      '/moderations/last_moderation/MLA2-ITM',
    ]);
  });

  it('marks a listing paused from MercadoLibre without moderation, and skips transient states', async () => {
    const { reader } = setup([
      () =>
        Response.json([
          item('MLA1', 'paused'),
          item('MLA2', 'not_yet_active', { sub_status: ['picture_download_pending'] }),
          item('MLA3', 'paused', { sub_status: ['picture_download_pending'] }),
          item('MLA4', 'something_new'),
          item('MLA5', 'payment_required'),
        ]),
    ]);

    const states = unwrap(
      await reader.states('mercadolibre', ['MLA1', 'MLA2', 'MLA3', 'MLA4', 'MLA5']),
    );

    expect([...states.keys()]).toEqual(['MLA1', 'MLA5']);
    expect(states.get('MLA1')?.state).toBe('paused');
    expect(states.get('MLA5')).toEqual({
      state: 'paused',
      reason: 'MercadoLibre espera un pago para mostrar el aviso.',
    });
  });

  it('asks for at most 20 listings per request', async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `MLA${(i + 1).toString()}`);
    const { reader, requests } = setup([
      () => Response.json(ids.slice(0, 20).map((id) => item(id, 'active'))),
      () => Response.json([item('MLA21', 'active')]),
    ]);

    expect(unwrap(await reader.states('mercadolibre', ids)).size).toBe(21);
    expect(requests.map((r) => r.query.get('ids')?.split(',').length)).toEqual([20, 1]);
  });

  it('asks to reconnect on 401 and reports MercadoLibre down on 5xx or a bad answer', async () => {
    expect(
      unwrapErr(
        await setup([() => Response.json({}, { status: 401 })]).reader.states('mercadolibre', [
          'MLA1',
        ]),
      ),
    ).toEqual({ type: 'PortalCredentialsMissing' });
    expect(
      unwrapErr(
        await setup([() => Response.json({}, { status: 503 })]).reader.states('mercadolibre', [
          'MLA1',
        ]),
      ),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(
      unwrapErr(
        await setup([() => Response.json({ unexpected: true })]).reader.states('mercadolibre', [
          'MLA1',
        ]),
      ),
    ).toEqual({ type: 'PortalUnavailable' });
  });

  it('does not call MercadoLibre without credentials', async () => {
    const { reader, requests } = setup([], { tokenMissing: true });
    expect(unwrapErr(await reader.states('mercadolibre', ['MLA1']))).toEqual({
      type: 'PortalCredentialsMissing',
    });
    expect(requests).toEqual([]);
  });
});

describe('MercadoLibreAccountReader.packages', () => {
  it('reads the active packages of the account with their quota per listing type', async () => {
    const { reader, requests, logs } = setup([() => Response.json(PACKAGES)]);

    const packages = unwrap(
      await reader.packages({ portal: 'mercadolibre', externalAccountId: '3773207548' }),
    );

    expect(packages).toEqual([
      {
        id: '754985',
        name: 'Paquete 15 Básico',
        content: 'publications',
        expiresAt: new Date('2026-11-22T19:34:47.544Z'),
        quotas: [{ tier: 'silver', total: 15, used: 3, remaining: 12 }],
      },
      {
        id: '754986',
        name: 'Destaques Oro Premium',
        content: 'upgrades',
        expiresAt: undefined,
        quotas: [{ tier: 'gold_premium', total: 5, used: 0, remaining: 5 }],
      },
      {
        id: '754987',
        name: 'Ilimitado',
        content: 'publications',
        expiresAt: undefined,
        quotas: [],
      },
    ]);
    expect(requests[0]?.path).toBe('/users/3773207548/classifieds_promotion_packs');
    expect(requests[0]?.query.get('status')).toBe('active');
    expect(logs.join()).not.toContain(TOKEN);
  });

  it('asks to reconnect on 401 and reports MercadoLibre down on 5xx or a bad answer', async () => {
    const account = { portal: 'mercadolibre', externalAccountId: '1' } as const;
    expect(
      unwrapErr(await setup([() => Response.json({}, { status: 401 })]).reader.packages(account)),
    ).toEqual({ type: 'PortalCredentialsMissing' });
    expect(
      unwrapErr(await setup([() => Response.json({}, { status: 500 })]).reader.packages(account)),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(
      unwrapErr(await setup([() => Response.json({ not: 'a list' })]).reader.packages(account)),
    ).toEqual({ type: 'PortalUnavailable' });
  });
});
