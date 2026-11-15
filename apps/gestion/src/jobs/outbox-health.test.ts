import { describe, expect, it } from 'vitest';

import { checkExhaustedOutbox } from './outbox-health';

function recorder(count: number) {
  const reports: string[] = [];
  const errors: unknown[] = [];
  return {
    reports,
    errors,
    deps: {
      exhaustedCount: () => Promise.resolve(count),
      report: (message: string) => reports.push(message),
      logger: { error: (...args: unknown[]) => errors.push(args) },
    },
  };
}

describe('checkExhaustedOutbox', () => {
  it('logs and reports the exhausted events', async () => {
    const { deps, reports, errors } = recorder(3);

    expect(await checkExhaustedOutbox(deps)).toBe(3);
    expect(reports).toEqual(['Outbox has 3 exhausted events that no subscriber received']);
    expect(errors).toHaveLength(1);
  });

  it('stays quiet when nothing is exhausted', async () => {
    const { deps, reports, errors } = recorder(0);

    expect(await checkExhaustedOutbox(deps)).toBe(0);
    expect(reports).toEqual([]);
    expect(errors).toEqual([]);
  });
});
