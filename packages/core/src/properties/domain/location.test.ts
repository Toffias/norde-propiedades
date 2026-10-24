import { describe, expect, it } from 'vitest';

import { locationContext } from './location';

describe('locationContext', () => {
  it('leaves out the country and repeated names', () => {
    expect(locationContext('Palermo', ['Argentina', 'CABA', 'CABA'])).toBe('CABA');
  });

  it('lists the closest ancestors first, two at most', () => {
    expect(
      locationContext('Villa Luzuriaga', ['Argentina', 'Buenos Aires', 'La Matanza', 'San Justo']),
    ).toBe('San Justo, La Matanza');
  });

  it('skips an ancestor named like the location itself', () => {
    expect(locationContext('CABA', ['Argentina', 'CABA'])).toBe('');
  });

  it('is empty for a top-level location', () => {
    expect(locationContext('Argentina', [])).toBe('');
  });
});
