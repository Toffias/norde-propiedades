import 'server-only';

import { isBuildPhase } from '../config/env';
import { getLogger } from '../config/logger';
import { startJobs } from '../container';

declare global {
  /** Next puede volver a evaluar los módulos en desarrollo: el arranque se recuerda en el proceso. */
  var nordeJobsStarted: boolean | undefined;
}

/**
 * Arranca el relay y los workers una sola vez por proceso (no en `next build`). Al recibir
 * SIGTERM o SIGINT se cortan y liberan sus conexiones.
 */
export async function startJobsInProcess(): Promise<void> {
  if (isBuildPhase() || globalThis.nordeJobsStarted) return;
  globalThis.nordeJobsStarted = true;

  const jobs = await startJobs();
  if (!jobs) return;

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      jobs.stop().catch((error: unknown) => {
        getLogger().error({ err: error, signal }, 'Could not stop the job workers');
      });
    });
  }
}
