import { err, ok } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { photoResponse } from './photo-response';

describe('photoResponse', () => {
  it('serves the photo with an immutable cache', async () => {
    const response = photoResponse(
      ok({ kind: 'content', contentType: 'image/jpeg', bytes: new Uint8Array([1, 2]) }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it('sends an old version to the current URL', () => {
    const response = photoResponse(ok({ kind: 'moved', path: '/fotos/abc/new' }));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/fotos/abc/new');
  });

  it('sends an imported photo to its link', () => {
    const response = photoResponse(ok({ kind: 'external', url: 'https://cdn.example/1.jpg' }));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://cdn.example/1.jpg');
  });

  it('answers 404 for a photo that is not public, cached only for a minute', () => {
    const response = photoResponse(err({ type: 'PhotoNotFound' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('fails loudly when the web actor cannot read properties', () => {
    expect(() => photoResponse(err({ type: 'Forbidden' }))).toThrow();
  });
});
