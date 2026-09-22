import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import type { HealthStatus } from './routes/health';
import { buildServer } from './server';

function serverWith(status: HealthStatus) {
  return buildServer({
    logger: pino({ level: 'silent' }),
    healthCheck: () => Promise.resolve(status),
  });
}

describe('GET /health', () => {
  it('returns 200 when the database is up', async () => {
    const response = await serverWith({ database: 'up' }).inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    const response = await serverWith({ database: 'down' }).inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'degraded', database: 'down' });
  });
});
