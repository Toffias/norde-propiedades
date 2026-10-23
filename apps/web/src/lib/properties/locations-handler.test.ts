import { describe, expect, it } from 'vitest';

import { createLocationsHandler } from './locations-handler';

const palermo = {
  id: '00000000-0000-7000-8001-0000000000a1',
  name: 'Palermo',
  description: 'Barrio · CABA',
  listingCount: 12,
};

function handler(allowed = true) {
  const asked: string[] = [];
  const handle = createLocationsHandler({
    allow: () => Promise.resolve(allowed),
    suggest: (q) => {
      asked.push(q);
      return Promise.resolve([palermo]);
    },
  });
  return { handle, asked };
}

describe('locations handler', () => {
  it('returns the suggestions for the trimmed text, cacheable', async () => {
    const { handle, asked } = handler();

    const response = await handle(new Request('http://localhost/api/ubicaciones?q=%20pal%20'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age=60');
    expect(await response.json()).toEqual({ options: [palermo] });
    expect(asked).toEqual(['pal']);
  });

  it('rejects a missing, too short or too long text without searching', async () => {
    const { handle, asked } = handler();

    for (const query of ['', '?q=p', `?q=${'a'.repeat(81)}`]) {
      const response = await handle(new Request(`http://localhost/api/ubicaciones${query}`));
      expect(response.status).toBe(400);
    }
    expect(asked).toEqual([]);
  });

  it('answers 429 past the rate limit', async () => {
    const { handle, asked } = handler(false);

    const response = await handle(new Request('http://localhost/api/ubicaciones?q=pal'));

    expect(response.status).toBe(429);
    expect(asked).toEqual([]);
  });
});
