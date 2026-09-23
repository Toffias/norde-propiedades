import { describe, expect, it } from 'vitest';

import { formatDate, joinNames } from './format';

describe('formatDate', () => {
  it('shows the date in Buenos Aires time', () => {
    // 01:30 UTC del 1 de septiembre es todavía 31 de agosto en Buenos Aires (UTC-3).
    expect(formatDate('2026-09-01T01:30:00.000Z')).toBe('31 de agosto de 2026');
  });
});

describe('joinNames', () => {
  it('joins names in Spanish', () => {
    expect(joinNames(['Ana'])).toBe('Ana');
    expect(joinNames(['Ana', 'Juan'])).toBe('Ana y Juan');
    expect(joinNames(['Ana', 'Juan', 'Sol'])).toBe('Ana, Juan y Sol');
  });
});
