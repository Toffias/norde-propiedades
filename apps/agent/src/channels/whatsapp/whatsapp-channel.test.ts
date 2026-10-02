import { describe, expect, it } from 'vitest';

import { signBody, verifySignature } from '../../http/signature';

import { FailureBreaker } from './failure-breaker';
import { parseInbound } from './inbound';
import { KeyedQueue } from './keyed-queue';
import { MessageBatcher } from './message-batcher';
import { NoticeThrottle } from './notices';
import { buildWhatsAppReply, cleanForWhatsApp, FALLBACK_TEXT } from './reply-builder';

const payload = (messages: unknown[], contacts: unknown[] = []) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '5491100000000', phone_number_id: 'PNID' },
            contacts,
            messages,
          },
        },
      ],
    },
  ],
});

describe('verifySignature', () => {
  const body = Buffer.from('{"hola":"mundo"}');

  it('accepts the HMAC of the raw body', () => {
    expect(verifySignature(body, signBody(body, 'secret'), 'secret')).toBe(true);
  });

  it('rejects other secrets, other bodies and malformed headers', () => {
    expect(verifySignature(body, signBody(body, 'otro'), 'secret')).toBe(false);
    expect(verifySignature(Buffer.from('{}'), signBody(body, 'secret'), 'secret')).toBe(false);
    expect(verifySignature(body, 'sha1=abc', 'secret')).toBe(false);
    expect(verifySignature(body, undefined, 'secret')).toBe(false);
  });
});

describe('parseInbound', () => {
  it('normalizes text, button and unsupported messages with the profile name', () => {
    const messages = parseInbound(
      payload(
        [
          {
            from: '5491166899124',
            id: 'wamid.1',
            timestamp: '1767225600',
            type: 'text',
            text: { body: 'hola' },
          },
          {
            from: '5491166899124',
            id: 'wamid.2',
            timestamp: '1767225601',
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'opt_1', title: 'Alquilar' } },
          },
          {
            from: '5491166899124',
            id: 'wamid.3',
            timestamp: '1767225602',
            type: 'audio',
            audio: { id: 'a' },
          },
        ],
        [{ wa_id: '5491166899124', profile: { name: 'Ana' } }],
      ),
    );

    expect(messages).toEqual([
      {
        phoneNumberId: 'PNID',
        from: '5491166899124',
        profileName: 'Ana',
        message: {
          channelMessageId: 'wamid.1',
          kind: 'text',
          text: 'hola',
          sentAt: new Date(1767225600 * 1000),
          rawType: 'text',
        },
      },
      expect.objectContaining({
        message: expect.objectContaining({ kind: 'button', text: 'Alquilar' }) as unknown,
      }),
      expect.objectContaining({
        message: expect.objectContaining({ kind: 'unsupported', rawType: 'audio' }) as unknown,
      }),
    ]);
  });

  it('ignores status events, messages with errors and other objects', () => {
    expect(parseInbound({ object: 'page', entry: [] })).toEqual([]);
    expect(parseInbound(payload([]))).toEqual([]);
    expect(
      parseInbound(
        payload([
          {
            from: '1',
            id: 'wamid.x',
            timestamp: '1',
            type: 'text',
            text: { body: 'x' },
            errors: [{ code: 1 }],
          },
          { id: 'sin-remitente' },
        ]),
      ),
    ).toEqual([]);
    expect(parseInbound('no es un objeto')).toEqual([]);
  });
});

describe('buildWhatsAppReply', () => {
  const empty = { photo: undefined, buttons: undefined };

  it('prioritizes photo, then buttons, then text', () => {
    const buttons = [{ id: 'opt_1', title: 'Ver más' }];
    const photo = { url: 'https://x.com/a.jpg', propertyId: 'p1' };

    expect(buildWhatsAppReply('Mirá', { photo, buttons })).toEqual({
      type: 'image',
      imageUrl: 'https://x.com/a.jpg',
      caption: 'Mirá',
    });
    expect(buildWhatsAppReply('¿Seguimos?', { photo: undefined, buttons })).toEqual({
      type: 'buttons',
      text: '¿Seguimos?',
      buttons,
    });
    expect(buildWhatsAppReply('Hola', empty)).toEqual({ type: 'text', text: 'Hola' });
  });

  it('falls back to a generic text when the model wrote nothing', () => {
    expect(buildWhatsAppReply(undefined, empty)).toEqual({ type: 'text', text: FALLBACK_TEXT });
  });

  it('cleans markdown that WhatsApp does not render', () => {
    expect(cleanForWhatsApp('## Opciones\n- **Depto** [ficha](https://x.com/p)\n\n\n\nFin')).toBe(
      'Opciones\n• *Depto* ficha: https://x.com/p\n\nFin',
    );
  });
});

describe('MessageBatcher and KeyedQueue', () => {
  it('groups consecutive messages of the same contact into one batch', async () => {
    const batches: string[][] = [];
    const queue = new KeyedQueue();
    const batcher = new MessageBatcher<{ from: string; text: string }>({
      queue,
      keyOf: (m) => m.from,
      debounceMs: 20,
      process: (batch) => {
        batches.push(batch.map((m) => m.text));
        return Promise.resolve();
      },
      onError: () => undefined,
    });

    batcher.push({ from: 'a', text: 'hola' });
    batcher.push({ from: 'a', text: 'busco depto' });
    batcher.push({ from: 'b', text: 'otro' });
    await new Promise((r) => setTimeout(r, 60));

    expect(batches.sort()).toEqual([['hola', 'busco depto'], ['otro']]);
  });

  it('drains pending batches on shutdown', async () => {
    const processed: string[] = [];
    const batcher = new MessageBatcher<string>({
      queue: new KeyedQueue(),
      keyOf: () => 'k',
      debounceMs: 60_000,
      process: (batch) => {
        processed.push(...batch);
        return Promise.resolve();
      },
      onError: () => undefined,
    });
    batcher.push('pendiente');

    await batcher.drain();

    expect(processed).toEqual(['pendiente']);
    expect(batcher.pendingCount).toBe(0);
  });

  it('runs the tasks of one key in order, even when one fails', async () => {
    const queue = new KeyedQueue();
    const order: string[] = [];
    const slow = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          order.push('first');
          resolve();
        }, 20),
      );

    const failing = queue.enqueue('k', () => Promise.reject(new Error('boom')));
    const first = queue.enqueue('k', slow);
    const second = queue.enqueue('k', () => {
      order.push('second');
      return Promise.resolve();
    });

    await expect(failing).rejects.toThrow('boom');
    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });
});

describe('FailureBreaker', () => {
  it('opens after the threshold and allows one attempt after the cooldown', () => {
    let now = 0;
    const breaker = new FailureBreaker(2, 1000, () => now);

    expect(breaker.recordFailure()).toBe(false);
    expect(breaker.recordFailure()).toBe(true);
    expect(breaker.isOpen()).toBe(true);

    now = 1000;
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.recordFailure()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.isOpen()).toBe(false);
  });
});

describe('NoticeThrottle', () => {
  it('allows one notice per contact and period', () => {
    let now = 0;
    const throttle = new NoticeThrottle(1000, () => now);

    expect(throttle.allow('contact_limit', 'a')).toBe(true);
    expect(throttle.allow('contact_limit', 'a')).toBe(false);
    expect(throttle.allow('unsupported_content', 'a')).toBe(true);
    expect(throttle.allow('contact_limit', 'b')).toBe(true);
    now = 1000;
    expect(throttle.allow('contact_limit', 'a')).toBe(true);
  });
});
