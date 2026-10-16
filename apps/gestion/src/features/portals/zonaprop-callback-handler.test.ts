import { err, ok } from '@norde/core/shared';
import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';

import { createZonapropCallbackHandler } from './zonaprop-callback-handler';

vi.mock('server-only', () => ({}));

const TOKEN = 'a-callback-token-of-at-least-32-chars!';
const HEADER = 'x-norde-token';
const URL = 'http://localhost:3001/api/webhooks/portals/zonaprop';
// El aviso de un mensaje, con la forma de Open Navent (español) y datos inventados.
const MESSAGE = JSON.stringify({
  idEvento: '67b02b7a-e648-441d-90f7-e298c3cac633',
  tipoEvento: 'CONTACTO_MENSAJE',
  idMensaje: 236161673,
  idTipoContacto: 1,
  referencia: 'PRO3621230',
  nombre: 'Juli',
  email: 'juli@example.test',
  mensaje: 'Hola',
});

function setup(options: { ratePerMinute?: number; fail?: boolean } = {}) {
  let notified = 0;
  const clock = { now: 0 };
  const handle = createZonapropCallbackHandler({
    token: TOKEN,
    header: HEADER,
    ratePerMinute: options.ratePerMinute ?? 120,
    logger: pino({ level: 'silent' }),
    now: () => clock.now,
    notify: () => {
      notified += 1;
      return Promise.resolve(options.fail ? err({ type: 'ValidationFailed' }) : ok(undefined));
    },
  });
  /** `null`: sin header. */
  const post = (body: string, token: string | null = TOKEN, ip = '203.0.113.7') =>
    handle(
      new Request(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': ip,
          ...(token === null ? {} : { [HEADER]: token }),
        },
        body,
      }),
    );
  return { post, notified: () => notified };
}

describe('Zonaprop callback', () => {
  it('asks to read the contacts when a contact arrives', async () => {
    const { post, notified } = setup();
    const response = await post(MESSAGE);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(notified()).toBe(1);
  });

  it('also reacts to a phone view (CONTACTO) and to a body without the event type', async () => {
    const { post, notified } = setup();
    expect((await post(JSON.stringify({ tipoEvento: 'CONTACTO' }))).status).toBe(200);
    expect((await post(JSON.stringify({}))).status).toBe(200);
    expect(notified()).toBe(2);
  });

  it('ignores the events that are not contacts', async () => {
    const { post, notified } = setup();
    const response = await post(JSON.stringify({ tipoEvento: 'CREDITO' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ignored: true });
    expect(notified()).toBe(0);
  });

  it('rejects a missing or wrong token', async () => {
    const { post, notified } = setup();
    expect((await post(MESSAGE, null)).status).toBe(401);
    expect((await post(MESSAGE, 'a-callback-token-of-at-least-32-chars?')).status).toBe(401);
    expect((await post(MESSAGE, 'short')).status).toBe(401);
    expect(notified()).toBe(0);
  });

  it('rejects an invalid body and a body that is too large', async () => {
    const { post, notified } = setup();
    expect((await post('{not json')).status).toBe(400);
    expect((await post(JSON.stringify({ tipoEvento: 42 }))).status).toBe(400);
    expect((await post(JSON.stringify({ x: 'a'.repeat(20_000) }))).status).toBe(413);
    expect(notified()).toBe(0);
  });

  it('limits the requests per IP', async () => {
    const { post } = setup({ ratePerMinute: 2 });
    expect((await post(MESSAGE)).status).toBe(200);
    expect((await post(MESSAGE)).status).toBe(200);
    expect((await post(MESSAGE)).status).toBe(429);
    expect((await post(MESSAGE, TOKEN, '198.51.100.9')).status).toBe(200);
  });

  it('answers 500 so Zonaprop retries when it cannot be processed', async () => {
    const { post } = setup({ fail: true });
    expect((await post(MESSAGE)).status).toBe(500);
  });
});
