import { describe, expect, it } from 'vitest';

import { portalAlertUrgency, signingUrgency, waitingUrgency, worstUrgency } from './urgency';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

describe('waitingUrgency', () => {
  it('is ok before a day of waiting', () => {
    expect(waitingUrgency(hoursAgo(0), NOW)).toBe('ok');
    expect(waitingUrgency(hoursAgo(23.9), NOW)).toBe('ok');
  });

  it('asks for attention from the first day', () => {
    expect(waitingUrgency(hoursAgo(24), NOW)).toBe('warning');
    expect(waitingUrgency(hoursAgo(71.9), NOW)).toBe('warning');
  });

  it('is overdue from the third day', () => {
    expect(waitingUrgency(hoursAgo(72), NOW)).toBe('overdue');
    expect(waitingUrgency(hoursAgo(24 * 19), NOW)).toBe('overdue');
  });
});

describe('signingUrgency', () => {
  it('is overdue when the estimated date already passed', () => {
    expect(signingUrgency('2026-10-18', '2026-10-19')).toBe('overdue');
  });

  it('asks for attention when the signing is within the week', () => {
    expect(signingUrgency('2026-10-19', '2026-10-19')).toBe('warning');
    expect(signingUrgency('2026-10-26', '2026-10-19')).toBe('warning');
  });

  it('is ok when the signing is further away', () => {
    expect(signingUrgency('2026-10-27', '2026-10-19')).toBe('ok');
  });
});

describe('portalAlertUrgency', () => {
  it('is overdue when the listing failed and asks for attention when it is paused', () => {
    expect(portalAlertUrgency('error')).toBe('overdue');
    expect(portalAlertUrgency('paused')).toBe('warning');
  });
});

describe('worstUrgency', () => {
  it('returns the most urgent level', () => {
    expect(worstUrgency([])).toBe('ok');
    expect(worstUrgency(['ok', 'warning'])).toBe('warning');
    expect(worstUrgency(['warning', 'overdue', 'ok'])).toBe('overdue');
  });
});
