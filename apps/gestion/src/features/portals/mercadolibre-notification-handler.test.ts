import { err, ok } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { createMercadoLibreNotificationHandler } from './mercadolibre-notification-handler';

vi.mock('server-only', () => ({}));

const APP_ID = '2069392825111111';
const URL = 'http://localhost:3001/api/webhooks/portals/mercadolibre';
// Una notificación de `vis_leads` con la forma de la doc de MercadoLibre.
const LEAD = {
  _id: 'f9f08571-1f65-4c46-9e0a-c0f43faas1557e',
  resource: '/vis/leads/14b52fd8-85dc-11eb-8436-2753cb1f9665',
  user_id: 3773207548,
  topic: 'vis_leads',
  actions: ['question'],
  application_id: Number(APP_ID),
  attempts: 1,
  sent: '2026-10-18T13:44:33.006Z',
  received: '2026-10-18T13:44:32.984Z',
};

function setup(options: { ratePerMinute?: number; fail?: boolean; unknownAccount?: boolean } = {}) {
  const notified: string[] = [];
  const items: [string, string][] = [];
  const handle = createMercadoLibreNotificationHandler({
    applicationId: APP_ID,
    ratePerMinute: options.ratePerMinute ?? 240,
    logger: pino({ level: 'silent' }),
    now: () => 0,
    notify: (userId) => {
      notified.push(userId);
      if (options.fail) return Promise.resolve(err({ type: 'ValidationFailed' }));
      return Promise.resolve(ok({ portal: options.unknownAccount ? undefined : 'mercadolibre' }));
    },
    notifyItem: (userId, itemId) => {
      items.push([userId, itemId]);
      return Promise.resolve(ok({ portal: options.unknownAccount ? undefined : 'mercadolibre' }));
    },
  });
  const post = (body: unknown, ip = '203.0.113.7') =>
    handle(
      new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  return { post, notified, items };
}

describe('MercadoLibre notifications', () => {
  it('asks to read the leads of the account when a lead arrives', async () => {
    const { post, notified } = setup();
    const response = await post(LEAD);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(notified).toEqual(['3773207548']);
  });

  it('takes questions too, with the ids as strings', async () => {
    const { post, notified } = setup();
    const response = await post({
      resource: '/questions/5036111111',
      user_id: '3773207548',
      topic: 'questions',
      application_id: APP_ID,
      attempts: 1,
    });
    expect(response.status).toBe(200);
    expect(notified).toEqual(['3773207548']);
  });

  it('asks to reconcile the listing when one of its items changes', async () => {
    const { post, notified, items } = setup();
    const response = await post({ ...LEAD, topic: 'items', resource: '/items/MLA686791111' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(items).toEqual([['3773207548', 'MLA686791111']]);
    expect(notified).toEqual([]);

    const notOurs = setup({ unknownAccount: true });
    const ignored = await notOurs.post({ ...LEAD, topic: 'items', resource: '/items/MLA1' });
    expect(await ignored.json()).toEqual({ ignored: true });
  });

  it('accepts and ignores other topics and accounts Norde has not connected', async () => {
    const other = setup();
    expect((await other.post({ ...LEAD, topic: 'orders_v2' })).status).toBe(200);
    expect((await other.post({ ...LEAD, topic: 'items', resource: '/items/x' })).status).toBe(200);
    expect(other.notified).toEqual([]);
    expect(other.items).toEqual([]);

    const unknown = setup({ unknownAccount: true });
    const response = await unknown.post(LEAD);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
  });

  it('rejects a notification for another application', async () => {
    const { post, notified } = setup();
    expect((await post({ ...LEAD, application_id: 1 })).status).toBe(403);
    expect(notified).toEqual([]);
  });

  it('rejects invalid bodies', async () => {
    const { post, notified } = setup();
    expect((await post('not json')).status).toBe(400);
    expect(
      (await post({ topic: 'vis_leads', user_id: 'abc', application_id: APP_ID })).status,
    ).toBe(400);
    expect((await post({ ...LEAD, padding: 'x'.repeat(17 * 1024) })).status).toBe(413);
    expect(notified).toEqual([]);
  });

  it('answers 500 when the notice cannot be queued, so MercadoLibre retries', async () => {
    const { post } = setup({ fail: true });
    expect((await post(LEAD)).status).toBe(500);
  });

  it('limits the requests per IP', async () => {
    const { post } = setup({ ratePerMinute: 1 });
    expect((await post(LEAD)).status).toBe(200);
    expect((await post(LEAD)).status).toBe(429);
    expect((await post(LEAD, '198.51.100.1')).status).toBe(200);
  });
});
