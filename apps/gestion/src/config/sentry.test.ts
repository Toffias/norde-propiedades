import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { scrubBreadcrumb, scrubEvent, scrubText } from './sentry';

describe('scrubText', () => {
  it('masks emails', () => {
    expect(scrubText('Duplicate contact juan.perez+norde@gmail.com')).toBe(
      'Duplicate contact [email]',
    );
  });

  it('masks phones, DNI and CUIT, with or without separators', () => {
    expect(scrubText('Phone +5491155551234 is taken')).toBe('Phone [number] is taken');
    expect(scrubText('Phone 11 5555-1234 is taken')).toBe('Phone [number] is taken');
    expect(scrubText('DNI 30.123.456')).toBe('DNI [number]');
    expect(scrubText('CUIT 20-30123456-7')).toBe('CUIT [number]');
  });

  it('keeps UUIDs, short numbers and the path of a URL', () => {
    const id = '0190a3b4-1234-7567-8abc-1234567890ab';
    expect(scrubText(`Property ${id} not found on page 12`)).toBe(
      `Property ${id} not found on page 12`,
    );
    expect(scrubText('/contactos/abc')).toBe('/contactos/abc');
  });

  it('drops query strings, where the grid filters live', () => {
    expect(scrubText('GET https://panel.test/contactos?q=1155551234&page=2 failed')).toBe(
      'GET https://panel.test/contactos failed',
    );
  });
});

describe('scrubEvent', () => {
  it('scrubs messages, exceptions, the request and breadcrumbs, and drops request data', () => {
    const event: ErrorEvent = {
      type: undefined,
      message: 'Failed for ana@norde.com.ar',
      exception: { values: [{ type: 'Error', value: 'Phone 1155551234 already exists' }] },
      request: {
        method: 'POST',
        url: 'https://panel.test/contactos?q=ana',
        query_string: 'q=ana',
        cookies: { session: 'secret' },
        data: { phone: '1155551234' },
        headers: { cookie: 'session=secret' },
      },
      breadcrumbs: [{ category: 'navigation', data: { to: '/contactos?q=ana', status: 200 } }],
    };

    expect(scrubEvent(event)).toEqual({
      type: undefined,
      message: 'Failed for [email]',
      exception: { values: [{ type: 'Error', value: 'Phone [number] already exists' }] },
      request: { method: 'POST', url: 'https://panel.test/contactos' },
      breadcrumbs: [{ category: 'navigation', data: { to: '/contactos', status: 200 } }],
    });
  });
});

describe('scrubBreadcrumb', () => {
  it('scrubs the message and string data', () => {
    expect(
      scrubBreadcrumb({ category: 'console', message: 'Sent to ana@norde.com.ar', data: { n: 1 } }),
    ).toEqual({ category: 'console', message: 'Sent to [email]', data: { n: 1 } });
  });
});
