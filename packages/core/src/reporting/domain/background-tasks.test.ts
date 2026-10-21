import { describe, expect, it } from 'vitest';

import { finishedTasksSince, isSystemRequester } from './background-tasks';

const NOW = new Date('2026-10-21T12:00:00Z');
const WEEK_AGO = new Date('2026-10-14T12:00:00Z');

describe('finishedTasksSince', () => {
  it('shows the finished tasks of the last week', () => {
    expect(finishedTasksSince(NOW, undefined)).toEqual(WEEK_AGO);
  });

  it('starts when they were cleared, if that was later', () => {
    const cleared = new Date('2026-10-21T09:00:00Z');
    expect(finishedTasksSince(NOW, cleared)).toEqual(cleared);
    expect(finishedTasksSince(NOW, new Date('2026-10-01T00:00:00Z'))).toEqual(WEEK_AGO);
  });
});

describe('isSystemRequester', () => {
  it('tells the jobs from the people', () => {
    expect(isSystemRequester('system:import')).toBe(true);
    expect(isSystemRequester('00000000-0000-7000-8000-0000000000a1')).toBe(false);
  });
});
