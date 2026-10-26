import { describe, expect, it } from 'vitest';

import { DailyBudget, turnCostUsd } from './daily-budget';

const PRICES = { inputPerMillion: 0.25, cachedInputPerMillion: 0.025, outputPerMillion: 2 };
const usage = (input: number, cached: number, output: number) => ({
  requests: 1,
  inputTokens: input,
  outputTokens: output,
  cachedInputTokens: cached,
  reasoningTokens: 0,
});

describe('DailyBudget', () => {
  it('prices cached input tokens apart', () => {
    expect(turnCostUsd(usage(1_000_000, 800_000, 100_000), PRICES)).toBeCloseTo(0.27);
  });

  it('closes when the last 24 hours reach the limit and reopens after', () => {
    let now = 0;
    const budget = new DailyBudget(0.5, PRICES, () => now);

    budget.record(usage(0, 0, 200_000));
    expect(budget.exceeded()).toBe(false);
    budget.record(usage(0, 0, 100_000));
    expect(budget.exceeded()).toBe(true);

    now += 24 * 3_600_000 + 1;
    expect(budget.exceeded()).toBe(false);
  });

  it('only measures without a limit', () => {
    const budget = new DailyBudget(undefined, PRICES);
    budget.record(usage(0, 0, 10_000_000));

    expect(budget.exceeded()).toBe(false);
  });
});
