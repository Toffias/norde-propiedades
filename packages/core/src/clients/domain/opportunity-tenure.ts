const DAY_MS = 24 * 60 * 60 * 1000;

export interface StageTenure {
  /** Desde cuándo está en el estado actual. */
  readonly since: Date;
  /** Días completos en el estado actual. */
  readonly days: number;
}

/**
 * Vigencia: el tiempo que lleva la oportunidad en su estado actual, desde el último cambio de
 * estado del historial. Sin cambios registrados, desde que se creó.
 */
export function stageTenure(
  changes: readonly { readonly changedAt: Date }[],
  createdAt: Date,
  now: Date,
): StageTenure {
  const since = changes.reduce(
    (latest, change) => (change.changedAt > latest ? change.changedAt : latest),
    createdAt,
  );
  const elapsed = Math.max(0, now.getTime() - since.getTime());
  return { since, days: Math.floor(elapsed / DAY_MS) };
}
