import { describe, expect, it } from 'vitest';

import { dateRangePresets, formatDateRange, parseIsoDate, toIsoDate } from './date-range';

describe('parseIsoDate', () => {
  it('reads a local calendar date and round-trips it', () => {
    const date = parseIsoDate('2026-10-05');
    expect(date && [date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 9, 5]);
    expect(date && toIsoDate(date)).toBe('2026-10-05');
  });

  it('rejects empty, malformed and impossible dates', () => {
    expect(parseIsoDate('')).toBeUndefined();
    expect(parseIsoDate('05/10/2026')).toBeUndefined();
    expect(parseIsoDate('2026-02-31')).toBeUndefined();
  });
});

describe('formatDateRange', () => {
  it('shows the year once when both ends share it', () => {
    expect(formatDateRange({ from: '2026-09-28', to: '2026-10-05' })).toMatch(
      /^28 sept? – 5 oct 2026$/,
    );
  });

  it('shows both years across a new year', () => {
    expect(formatDateRange({ from: '2025-12-28', to: '2026-01-04' })).toBe(
      '28 dic 2025 – 4 ene 2026',
    );
  });

  it('shows a single day, open ends and nothing', () => {
    expect(formatDateRange({ from: '2026-10-05', to: '2026-10-05' })).toBe('5 oct 2026');
    expect(formatDateRange({ from: '2026-10-05', to: '' })).toBe('Desde 5 oct 2026');
    expect(formatDateRange({ from: '', to: '2026-10-05' })).toBe('Hasta 5 oct 2026');
    expect(formatDateRange({ from: '', to: '' })).toBeUndefined();
  });
});

describe('dateRangePresets', () => {
  it('builds the shortcuts relative to today', () => {
    const presets = Object.fromEntries(
      dateRangePresets(new Date(2026, 2, 5)).map((preset) => [preset.label, preset.range]),
    );
    expect(presets).toEqual({
      Hoy: { from: '2026-03-05', to: '2026-03-05' },
      'Últimos 7 días': { from: '2026-02-27', to: '2026-03-05' },
      'Últimos 30 días': { from: '2026-02-04', to: '2026-03-05' },
      'Este mes': { from: '2026-03-01', to: '2026-03-05' },
      'Mes pasado': { from: '2026-02-01', to: '2026-02-28' },
      'Este año': { from: '2026-01-01', to: '2026-03-05' },
    });
  });
});
