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

  it('also counts spending that is not model tokens, like a transcription', () => {
    const budget = new DailyBudget(0.01, PRICES);

    budget.recordUsd(0.004);
    expect(budget.exceeded()).toBe(false);
    budget.recordUsd(0.006);
    expect(budget.exceeded()).toBe(true);
    expect(budget.spentUsd()).toBeCloseTo(0.01);
  });

  it('forgets turns older than 24 hours', () => {
    let now = 0;
    const budget = new DailyBudget(10, PRICES, () => now);
    budget.record(usage(0, 0, 1));
    now += 24 * 3_600_000 + 1;
    budget.record(usage(0, 0, 1));

    expect(budget.entryCount).toBe(1);
  });
});
