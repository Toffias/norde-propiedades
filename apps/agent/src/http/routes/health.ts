import type { AppInstance } from '../types';

export interface HealthStatus {
  readonly database: 'up' | 'down';
}

export type HealthCheck = () => Promise<HealthStatus>;

export function registerHealthRoutes(app: AppInstance, healthCheck: HealthCheck): void {
  app.get('/health', async (_request, reply) => {
    const status = await healthCheck();
    const healthy = status.database === 'up';

    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', ...status });
  });
}
