import { describe, expect, it } from 'vitest';

import type { InfraLogger } from '../../shared/logger';

import { ResendMailer } from './resend-mailer';

// Respuestas grabadas de la API de Resend (POST /emails).
const SENT = { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' };
const INVALID_FROM = {
  statusCode: 403,
  name: 'validation_error',
  message: 'The norde.com.ar domain is not verified.',
};
const RATE_LIMITED = { statusCode: 429, name: 'rate_limit_exceeded', message: 'Too many requests' };

const API_KEY = 're_test_key'; // gitleaks:allow

function setup(response: () => Response | Promise<Response>) {
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
    return Promise.resolve(response());
  };
  const mailer = new ResendMailer({
    apiKey: API_KEY,
    fromAddress: 'avisos@norde.com.ar',
    logger,
    fetch: fakeFetch,
  });
  return { mailer, requests, logs };
}

const email = {
  to: 'camila@norde.com.ar',
  subject: 'Prueba',
  text: 'Hola',
  fromName: 'Norde "Propiedades"',
  replyTo: 'consultas@norde.com.ar',
};

describe('ResendMailer', () => {
  it('sends the email with the sender name and reply-to', async () => {
    const { mailer, requests, logs } = setup(() => Response.json(SENT));

    const result = await mailer.send(email);

    expect(result.isOk()).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.resend.com/emails');
    expect(requests[0]?.init.headers).toMatchObject({ Authorization: `Bearer ${API_KEY}` });
    expect(
      JSON.parse(typeof requests[0]?.init.body === 'string' ? requests[0].init.body : '{}'),
    ).toEqual({
      from: 'Norde Propiedades <avisos@norde.com.ar>',
      to: ['camila@norde.com.ar'],
      subject: 'Prueba',
      text: 'Hola',
      reply_to: 'consultas@norde.com.ar',
    });
    // Nunca el email en claro en los logs.
    expect(logs.join()).not.toContain('camila@');
  });

  it('sends the attachments in base64', async () => {
    const { mailer, requests } = setup(() => Response.json(SENT));

    const result = await mailer.send({
      ...email,
      attachments: [
        { fileName: 'reporte.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1, 2]) },
      ],
    });

    expect(result.isOk()).toBe(true);
    const body: unknown = JSON.parse(
      typeof requests[0]?.init.body === 'string' ? requests[0].init.body : '{}',
    );
    expect(body).toMatchObject({
      attachments: [{ filename: 'reporte.pdf', content: 'AQI=', content_type: 'application/pdf' }],
    });
  });

  it('reports a rejection with the provider message, without retrying', async () => {
    const { mailer, requests } = setup(() => Response.json(INVALID_FROM, { status: 403 }));

    const result = await mailer.send(email);

    expect(result.isErr() && result.error).toEqual({
      type: 'MailRejected',
      reason: 'The norde.com.ar domain is not verified.',
    });
    expect(requests).toHaveLength(1);
  });

  it('reports rate limits, server errors and network failures as unavailable', async () => {
    for (const response of [
      () => Response.json(RATE_LIMITED, { status: 429 }),
      () => new Response('bad gateway', { status: 502 }),
      () => Promise.reject(new TypeError('fetch failed')),
    ]) {
      const { mailer } = setup(response);
      const result = await mailer.send(email);
      expect(result.isErr() && result.error).toEqual({ type: 'MailUnavailable' });
    }
  });

  it('is not configured without an API key or a sender address', async () => {
    const logger: InfraLogger = {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
    for (const options of [
      { apiKey: undefined, fromAddress: 'avisos@norde.com.ar' },
      { apiKey: API_KEY, fromAddress: undefined },
    ]) {
      const result = await new ResendMailer({ ...options, logger }).send(email);
      expect(result.isErr() && result.error).toEqual({ type: 'MailNotConfigured' });
    }
  });
});
