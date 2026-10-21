import { describe, expect, it } from 'vitest';

import { estimatedCommissionCents, pricePerM2Cents } from './operation-figures';

describe('pricePerM2Cents', () => {
  it('divides the price by the total surface, rounded to the cent', () => {
    // US$ 145.000 en 50 m²: US$ 2.900 el m².
    expect(pricePerM2Cents(14_500_000n, 50)).toBe(290_000n);
    // US$ 100.000 en 45,5 m²: US$ 2.197,80 el m².
    expect(pricePerM2Cents(10_000_000n, 45.5)).toBe(219_780n);
  });

  it('has no value without a price or a surface', () => {
    expect(pricePerM2Cents(undefined, 50)).toBeUndefined();
    expect(pricePerM2Cents(14_500_000n, undefined)).toBeUndefined();
    expect(pricePerM2Cents(14_500_000n, 0)).toBeUndefined();
  });
});

describe('estimatedCommissionCents', () => {
  it('applies the percentage to the price, rounded to the cent', () => {
    // 3 % de US$ 145.000: US$ 4.350.
    expect(estimatedCommissionCents(14_500_000n, 3)).toBe(435_000n);
    // 4,5 % de $ 650.000: $ 29.250.
    expect(estimatedCommissionCents(65_000_000n, 4.5)).toBe(2_925_000n);
    // 1,25 % de $ 999,99: $ 12,50 (12,49987 redondea hacia arriba).
    expect(estimatedCommissionCents(99_999n, 1.25)).toBe(1_250n);
  });

  it('has no value without a price or a percentage', () => {
    expect(estimatedCommissionCents(undefined, 3)).toBeUndefined();
    expect(estimatedCommissionCents(14_500_000n, undefined)).toBeUndefined();
  });
});
