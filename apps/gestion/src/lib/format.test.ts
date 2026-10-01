import { describe, expect, it } from 'vitest';

import {
  EMPTY_VALUE,
  formatCount,
  formatDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatPeriod,
} from './format';

/** Intl separa el símbolo con un espacio duro: los tests comparan con espacio común. */
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it('formats pesos without decimals and with a thousands dot', () => {
    expect(plain(formatMoney({ amountCents: 42_000_000n, currency: 'ARS' }))).toBe('$ 420.000');
  });

  it('formats dollars with the US$ symbol', () => {
    expect(plain(formatMoney({ amountCents: 150_000n, currency: 'USD' }))).toBe('US$ 1.500');
  });

  it('puts the sign before the symbol', () => {
    expect(plain(formatMoney({ amountCents: -100_000n, currency: 'ARS' }))).toBe('-$ 1.000');
  });

  it('rounds the cents half up without going through number', () => {
    expect(plain(formatMoney({ amountCents: 9_007_199_254_740_993_50n, currency: 'ARS' }))).toBe(
      '$ 9.007.199.254.740.994',
    );
  });

  it('shows a dash when there is no amount', () => {
    expect(formatMoney(null)).toBe(EMPTY_VALUE);
  });
});

describe('formatMoneyCompact', () => {
  it('uses M for millions with one decimal', () => {
    expect(formatMoneyCompact(1_300_000)).toBe('$ 1,3 M');
  });

  it('uses mil for thousands', () => {
    expect(formatMoneyCompact(45_000)).toBe('$ 45 mil');
  });

  it('keeps small amounts as they are', () => {
    expect(formatMoneyCompact(900, 'USD')).toBe('US$ 900');
  });

  it('puts the sign before the symbol', () => {
    expect(formatMoneyCompact(-2_500_000)).toBe('-$ 2,5 M');
  });
});

describe('formatDate', () => {
  it('shows the Buenos Aires date of a UTC instant', () => {
    // 02:00 UTC del 1/10 son las 23:00 del 30/9 en Buenos Aires.
    expect(formatDate('2026-10-01T02:00:00Z')).toBe('30 sept 2026');
  });

  it('shows a dash for a missing or invalid value', () => {
    expect(formatDate(null)).toBe(EMPTY_VALUE);
    expect(formatDate('not a date')).toBe(EMPTY_VALUE);
  });
});

describe('formatDateTime', () => {
  it('includes the Buenos Aires time', () => {
    expect(plain(formatDateTime('2026-10-01T02:00:00Z'))).toBe('30 sept 2026, 23:00');
  });
});

describe('formatDateOnly', () => {
  it('formats a date without time as DD/MM/YYYY, without shifting the day', () => {
    expect(formatDateOnly('2026-10-01')).toBe('01/10/2026');
  });

  it('shows a dash for a malformed or impossible date', () => {
    expect(formatDateOnly('2026-13-01')).toBe(EMPTY_VALUE);
    expect(formatDateOnly('01/10/2026')).toBe(EMPTY_VALUE);
    expect(formatDateOnly(undefined)).toBe(EMPTY_VALUE);
  });
});

describe('formatPeriod', () => {
  it('capitalizes the month in the long style', () => {
    expect(formatPeriod(2026, 9)).toBe('Septiembre 2026');
  });

  it('abbreviates the month in the short style', () => {
    expect(formatPeriod(2026, 4, 'short')).toBe('abr 2026');
  });

  it('shows a dash for a month out of range', () => {
    expect(formatPeriod(2026, 13)).toBe(EMPTY_VALUE);
  });
});

describe('formatCount', () => {
  it('uses the singular for one', () => {
    expect(formatCount(1, 'propiedad', 'propiedades')).toBe('1 propiedad');
  });

  it('uses the plural and a thousands dot otherwise', () => {
    expect(formatCount(1200, 'propiedad', 'propiedades')).toBe('1.200 propiedades');
  });
});
