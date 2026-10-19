import { describe, expect, it } from 'vitest';

import { formatOpeningHours } from './opening-hours';

describe('formatOpeningHours', () => {
  it('turns schema.org ranges into a readable line', () => {
    expect(formatOpeningHours(['Mo-Fr 10:00-18:00', 'Sa 10:00-13:00'])).toBe(
      'Lun. a Vie. 10 a 18 h · Sáb. 10 a 13 h',
    );
  });

  it('keeps the minutes when they are not round and lists separate days', () => {
    expect(formatOpeningHours(['Mo,We 09:30-17:45'])).toBe('Lun., Mié. 9:30 a 17:45 h');
  });

  it('skips ranges it cannot read and returns null without any', () => {
    expect(formatOpeningHours(['Xx 10:00-18:00', 'todo el día'])).toBeNull();
    expect(formatOpeningHours([])).toBeNull();
  });
});
