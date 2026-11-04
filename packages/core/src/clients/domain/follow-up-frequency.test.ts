import { describe, expect, it } from 'vitest';

import { followUpIntervalDays, isFollowUpDue } from './follow-up-frequency';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-10T13:00:00Z');
const daysAgo = (days: number, minutes = 0) =>
  new Date(now.getTime() - days * DAY + minutes * 60_000);

describe('isFollowUpDue', () => {
  it('is due when no digest was ever sent', () => {
    expect(isFollowUpDue('monthly', undefined, now)).toBe(true);
  });

  it('daily is due every day', () => {
    expect(isFollowUpDue('daily', daysAgo(1), now)).toBe(true);
  });

  it('waits the days of the frequency', () => {
    expect(isFollowUpDue('every_3_days', daysAgo(2), now)).toBe(false);
    expect(isFollowUpDue('every_3_days', daysAgo(3), now)).toBe(true);
    expect(isFollowUpDue('weekly', daysAgo(6), now)).toBe(false);
    expect(isFollowUpDue('weekly', daysAgo(7), now)).toBe(true);
    expect(isFollowUpDue('monthly', daysAgo(29), now)).toBe(false);
    expect(isFollowUpDue('monthly', daysAgo(30), now)).toBe(true);
  });

  it('tolerates the daily job starting a few minutes earlier', () => {
    // El último salió a las 13:05 y hoy el job arranca a las 13:00.
    expect(isFollowUpDue('weekly', daysAgo(7, 5), now)).toBe(true);
  });
});

describe('followUpIntervalDays', () => {
  it('maps each frequency to its days', () => {
    expect(followUpIntervalDays('daily')).toBe(1);
    expect(followUpIntervalDays('every_3_days')).toBe(3);
    expect(followUpIntervalDays('weekly')).toBe(7);
    expect(followUpIntervalDays('monthly')).toBe(30);
  });
});
