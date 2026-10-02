import { loadEnv } from './config/env';
import { createLogger } from './config/logger';
import { createContainer } from './container';
import { buildServer } from './http/server';

const env = loadEnv();
const logger = createLogger(env);
const container = createContainer(env, logger);
const server = buildServer({
  logger,
  healthCheck: container.healthCheck,
  whatsapp: container.whatsapp?.webhook,
  webInquiries: container.webInquiries,
});

await container.startJobs();
await server.listen({ host: env.HOST, port: env.PORT });
logger.info(
  { model: env.OPENAI_MODEL, whatsapp: container.whatsapp !== undefined },
  'Norde agent ready',
);

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  try {
    // Primero se deja de aceptar tráfico; después se drenan los turnos y los jobs.
    await server.close();
    await container.close();
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, (received) => void shutdown(received));
}
