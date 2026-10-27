import { err, ok } from '@norde/core/shared';
import { unwrap, unwrapErr } from '@norde/core/shared/testing';
import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../../shared/logger';

import { MercadoLibreLeads } from './mercadolibre-leads';

// Respuestas de `/vis/users/{id}/leads/buyers` y `/questions/{id}`, recortadas de la doc de "Leads"
// de la guía de inmuebles.
const TOKEN = 'APP_USR-test-access-token'; // gitleaks:allow
const SINCE = new Date('2026-10-16T12:00:00Z');
const ACCOUNT = { portal: 'mercadolibre', externalAccountId: '3773207548', since: SINCE } as const;

function buyer(id: number, leads: object[], extra: object = {}) {
  return {
    id,
    item_id: 'MLA1430828018',
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+5491198765432',
    leads,
    ...extra,
  };
}

const QUESTION_LEAD = {
  id: '6b4aebf8-5570-47b8-9224-c1c177621575',
  contact_type: 'question',
  created_at: '2026-10-17T14:15:39Z',
  external_id: '12776297658',
  item_id: 'MLA1430828018',
  status: 'active',
};
const WHATSAPP_LEAD = {
  id: 'b711e264-ec67-480e-90b2-444d8f47d5ed',
  channel: 'whatsapp',
  contact_type: 'whatsapp',
  created_at: '2026-10-17T21:01:47Z',
  external_id: '',
  item_id: 'MLA1430828018',
};

function setup(responses: (() => Response)[], options: { tokenMissing?: boolean } = {}) {
  const requests: { path: string; query: URLSearchParams }[] = [];
  const logs: string[] = [];
  const logger: InfraLogger = {
    info: (details) => logs.push(JSON.stringify(details)),
    warn: (details) => logs.push(JSON.stringify(details)),
    error: (details) => logs.push(JSON.stringify(details)),
  };
  const fakeFetch: typeof fetch = (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    requests.push({ path: url.pathname, query: url.searchParams });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected request ${url.pathname}`);
    return Promise.resolve(next());
  };
  const leads = new MercadoLibreLeads({
    tokens: {
      accessToken: () =>
        Promise.resolve(
          options.tokenMissing ? err({ type: 'PortalCredentialsMissing' as const }) : ok(TOKEN),
        ),
    },
    logger,
    fetch: fakeFetch,
  });
  return { leads, requests, logs };
}

describe('MercadoLibreLeads.recent', () => {
  it('flattens the leads of each buyer and reads the text of the questions', async () => {
    const { leads, requests, logs } = setup([
      () =>
        Response.json({
          results: [buyer(2678328, [QUESTION_LEAD, WHATSAPP_LEAD])],
          paging: { offset: 0, limit: 50, total: 1 },
        }),
      () => Response.json({ id: 12776297658, status: 'UNANSWERED', text: '¿Acepta mascotas?' }),
    ]);

    const page = unwrap(await leads.recent({ ...ACCOUNT, offset: 0, limit: 100 }));

    expect(page.total).toBe(1);
    expect(page.items).toEqual([
      {
        externalId: '6b4aebf8-5570-47b8-9224-c1c177621575',
        kind: 'message',
        receivedAt: new Date('2026-10-17T14:15:39Z'),
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+5491198765432',
        message: '¿Acepta mascotas?',
        listingCode: 'MLA1430828018',
        unitPropertyId: undefined,
      },
      expect.objectContaining({
        externalId: 'b711e264-ec67-480e-90b2-444d8f47d5ed',
        kind: 'whatsapp',
        message: undefined,
      }),
    ]);
    expect(requests.map((r) => r.path)).toEqual([
      '/vis/users/3773207548/leads/buyers',
      '/questions/12776297658',
    ]);
    expect(requests[0]?.query.get('date_from')).toBe('2026-10-16');
    expect(requests[0]?.query.get('limit')).toBe('50');
    expect(requests[1]?.query.get('api_version')).toBe('4');
    expect(logs.join()).not.toContain('john@example.com');
  });

  it('maps the contact types and leaves a banned or deleted question without text', async () => {
    const { leads } = setup([
      () =>
        Response.json({
          results: [
            buyer(1, [
              { ...QUESTION_LEAD, id: 'q-banned', external_id: '1' },
              { ...QUESTION_LEAD, id: 'q-gone', external_id: '2' },
              { ...WHATSAPP_LEAD, id: 'call', contact_type: 'call' },
              { ...WHATSAPP_LEAD, id: 'visit', contact_type: 'visit_request' },
              { ...WHATSAPP_LEAD, id: 'callback', contact_type: 'contact_request' },
              { ...WHATSAPP_LEAD, id: 'quote', contact_type: 'quotation' },
            ]),
          ],
          paging: { total: 1 },
        }),
      () => Response.json({ status: 'BANNED', text: '' }),
      () => Response.json({ message: 'not found' }, { status: 404 }),
    ]);

    const page = unwrap(await leads.recent({ ...ACCOUNT, offset: 0, limit: 100 }));

    expect(page.items.map((l) => [l.externalId, l.kind, l.message])).toEqual([
      ['q-banned', 'message', undefined],
      ['q-gone', 'message', undefined],
      ['call', 'contact_data', undefined],
      ['visit', 'visit', undefined],
      ['callback', 'call_me', undefined],
      ['quote', 'quote', undefined],
    ]);
  });

  it('takes the quoted unit from the variation Norde published', async () => {
    const UNIT = '01920000-0000-7000-8000-0000000000e1';
    const { leads, requests } = setup([
      () =>
        Response.json({
          results: [
            buyer(1, [
              {
                ...WHATSAPP_LEAD,
                id: 'quote-1',
                contact_type: 'quotation',
                external_id: '5992689',
              },
              {
                ...WHATSAPP_LEAD,
                id: 'quote-2',
                contact_type: 'quotation',
                external_id: '5992690',
              },
            ]),
          ],
          paging: { total: 1 },
        }),
      () => Response.json({ id: 5992689, variation: { id: 1, seller_custom_field: UNIT } }),
      () => Response.json({ id: 5992690, variation: { id: 2, seller_custom_field: 'NPH456198' } }),
    ]);

    const page = unwrap(await leads.recent({ ...ACCOUNT, offset: 0, limit: 100 }));

    expect(page.items.map((l) => [l.kind, l.unitPropertyId])).toEqual([
      ['quote', UNIT],
      ['quote', undefined],
    ]);
    expect(requests[1]?.path).toBe('/quotations/5992689');
    expect(requests[1]?.query.get('caller.type')).toBe('seller');
  });

  it('keeps asking when MercadoLibre returns fewer buyers than requested', async () => {
    const { leads, requests } = setup([
      () => Response.json({ results: [buyer(1, [WHATSAPP_LEAD])], paging: { total: 3 } }),
      () =>
        Response.json({
          results: [
            buyer(2, [{ ...WHATSAPP_LEAD, id: 'w2' }]),
            buyer(3, [{ ...WHATSAPP_LEAD, id: 'w3' }]),
          ],
          paging: { total: 3 },
        }),
    ]);

    const page = unwrap(await leads.recent({ ...ACCOUNT, offset: 0, limit: 100 }));

    expect(page.items.map((l) => l.externalId)).toEqual([WHATSAPP_LEAD.id, 'w2', 'w3']);
    expect(requests.map((r) => r.query.get('offset'))).toEqual(['0', '1']);
  });

  it('counts buyers, not contacts, and the buyers that came without contacts', async () => {
    const { leads } = setup([
      () =>
        Response.json({
          results: [
            buyer(1, [
              WHATSAPP_LEAD,
              { ...WHATSAPP_LEAD, id: 'w1b' },
              { ...WHATSAPP_LEAD, id: 'w1c' },
            ]),
            buyer(2, []),
            buyer(3, [], { leads: undefined }),
          ],
          paging: { total: 3 },
        }),
    ]);

    const page = unwrap(await leads.recent({ ...ACCOUNT, offset: 0, limit: 100 }));

    expect(page).toMatchObject({ total: 3, read: 3, skipped: 2 });
    expect(page.items).toHaveLength(3);
  });

  it('reports MercadoLibre down on 5xx or a bad answer, and not configured without credentials', async () => {
    const page = { ...ACCOUNT, offset: 0, limit: 100 };
    expect(
      unwrapErr(await setup([() => Response.json({}, { status: 500 })]).leads.recent(page)),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(
      unwrapErr(await setup([() => Response.json({ results: 'x' })]).leads.recent(page)),
    ).toEqual({ type: 'PortalUnavailable' });
    expect(
      unwrapErr(await setup([() => Response.json({}, { status: 401 })]).leads.recent(page)),
    ).toEqual({ type: 'PortalNotConfigured' });
    const missing = setup([], { tokenMissing: true });
    expect(unwrapErr(await missing.leads.recent(page))).toEqual({ type: 'PortalNotConfigured' });
    expect(missing.requests).toEqual([]);
  });
});
