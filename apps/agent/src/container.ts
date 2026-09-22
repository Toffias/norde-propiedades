// Composition root: único archivo de la app que importa @norde/infra.
// Instancia los adaptadores y arma los casos de uso de @norde/core que expone la app.

import { createDatabase } from '@norde/infra';
import type { Logger } from 'pino';

import type { Env } from './config/env';
import type { HealthCheck } from './http/routes/health';

export interface Container {
  readonly healthCheck: HealthCheck;
  close(): Promise<void>;
}

export function createContainer(env: Env, logger: Logger): Container {
  const database = createDatabase({ url: env.DATABASE_URL, applicationName: 'norde-agent' });

  return {
    healthCheck: async () => {
      try {
        await database.ping();
        return { database: 'up' };
      } catch (error) {
        logger.warn({ err: error }, 'database health check failed');
        return { database: 'down' };
      }
    },
    close: () => database.close(),
  };
}
