import type { AgentTurnUsage } from '@norde/agent-kit';

/** Precios del modelo en USD por millón de tokens. */
export interface ModelPrices {
  readonly inputPerMillion: number;
  readonly cachedInputPerMillion: number;
  readonly outputPerMillion: number;
}

const DAY_MS = 24 * 3_600_000;

/** Costo estimado de un turno en USD. Los tokens cacheados se cobran a su precio. */
export function turnCostUsd(usage: AgentTurnUsage, prices: ModelPrices): number {
  const freshInput = usage.inputTokens - usage.cachedInputTokens;
  return (
    (freshInput * prices.inputPerMillion +
      usage.cachedInputTokens * prices.cachedInputPerMillion +
      usage.outputTokens * prices.outputPerMillion) /
    1_000_000
  );
}

/**
 * Tope de gasto en OpenAI de las últimas 24 h, sumando todos los canales: turnos del agente
 * (también los que fallan) y transcripciones de audios. Vive en memoria (el agente corre en una
 * instancia): un reinicio lo pone en cero.
 */
export class DailyBudget {
  readonly #spent: { readonly at: number; readonly usd: number }[] = [];

  constructor(
    private readonly limitUsd: number,
    private readonly prices: ModelPrices,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Registra el turno y devuelve su costo estimado. */
  record(usage: AgentTurnUsage): number {
    return this.recordUsd(turnCostUsd(usage, this.prices));
  }

  /** Registra un gasto que no son tokens del modelo (una transcripción) y lo devuelve. */
  recordUsd(usd: number): number {
    this.#spent.push({ at: this.now(), usd });
    return usd;
  }

  exceeded(): boolean {
    return this.spentUsd() >= this.limitUsd;
  }

  spentUsd(): number {
    const since = this.now() - DAY_MS;
    while (this.#spent.length > 0 && (this.#spent[0]?.at ?? 0) <= since) this.#spent.shift();
    return this.#spent.reduce((total, entry) => total + entry.usd, 0);
  }
}
