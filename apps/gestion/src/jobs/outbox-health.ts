import type { Logger } from 'pino';

/**
 * Chequeo programado del outbox (#221): un evento que agotó los intentos no llega a nadie
 * (portales, sitio, notificaciones) y, sin aviso, solo quedaba una línea de log. Se loguea como
 * error y se reporta a Sentry para que alguien lo reintente (docs/deploy.md, "Diagnóstico").
 */
export async function checkExhaustedOutbox(deps: {
  readonly exhaustedCount: () => Promise<number>;
  readonly report: (message: string) => void;
  readonly logger: Pick<Logger, 'error'>;
}): Promise<number> {
  const count = await deps.exhaustedCount();
  if (count > 0) {
    const message = `Outbox has ${String(count)} exhausted events that no subscriber received`;
    deps.logger.error({ exhausted: count }, message);
    deps.report(message);
  }
  return count;
}
