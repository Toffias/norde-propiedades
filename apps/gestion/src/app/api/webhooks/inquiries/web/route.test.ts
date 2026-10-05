import { describe, expect, it, vi } from 'vitest';

import { POST } from './route';

vi.mock('server-only', () => ({}));
vi.mock('../../../../../config/env', () => ({
  getEnv: () => ({ INQUIRY_WEBHOOK_SECRET: undefined, INQUIRY_WEBHOOK_RATE_PER_MINUTE: 60 }),
}));
vi.mock('../../../../../container', () => ({
  getContainer: () => {
    throw new Error('The container is not built without a secret');
  },
}));

describe('POST /api/webhooks/inquiries/web', () => {
  it('is not exposed without a secret', async () => {
    const response = await POST(
      new Request('http://localhost:3001/api/webhooks/inquiries/web', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(response.status).toBe(404);
  });
});
