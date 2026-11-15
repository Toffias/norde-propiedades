import type { AppInstance } from '../types';

export interface HealthStatus {
  readonly database: 'up' | 'down';
}

export type HealthCheck = () => Promise<HealthStatus>;

/** Cuánto se reutiliza el último chequeo: `/health` no consulta la base en cada pedido. */
export const HEALTH_CACHE_MS = 10_000;

export function registerHealthRoutes(
  app: AppInstance,
  healthCheck: HealthCheck,
  now: () => number = Date.now,
): void {
  let last: { readonly at: number; readonly status: Promise<HealthStatus> } | undefined;

  app.get('/health', async (_request, reply) => {
    const at = now();
    if (!last || at - last.at >= HEALTH_CACHE_MS) last = { at, status: healthCheck() };
    const status = await last.status;
    const healthy = status.database === 'up';

    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', ...status });
  });
}
