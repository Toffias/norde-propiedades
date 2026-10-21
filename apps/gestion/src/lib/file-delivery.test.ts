import { ok } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { deliverFile } from './file-delivery';

describe('deliverFile', () => {
  it('lets the browser reuse the redirect to a reusable photo URL', () => {
    const response = deliverFile(
      ok({ kind: 'redirect', url: 'https://bucket/photo', cacheSeconds: 3000 }),
      { inline: true },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://bucket/photo');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3000');
  });

  it('does not cache the redirect to a one-off signed URL', () => {
    const response = deliverFile(ok({ kind: 'redirect', url: 'https://bucket/file' }), {
      inline: false,
    });

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
