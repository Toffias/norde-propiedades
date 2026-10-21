/**
 * Cuánto se muestran los procesos terminados en la barra si nadie los limpia. Con una semana se ve
 * cómo terminó una importación larga sin que la lista crezca para siempre.
 */
export const FINISHED_TASKS_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Desde cuándo se muestran los terminados: la última semana, o desde que quien consulta los limpió
 * si fue después. Los en curso se muestran siempre.
 */
export function finishedTasksSince(now: Date, clearedAt: Date | undefined): Date {
  const window = new Date(now.getTime() - FINISHED_TASKS_WINDOW_DAYS * DAY_MS);
  return clearedAt !== undefined && clearedAt > window ? clearedAt : window;
}

/** Los procesos que corrió el sistema (`system:import`) no tienen una persona que los pidió. */
export function isSystemRequester(requesterId: string): boolean {
  return requesterId.startsWith('system:');
}
