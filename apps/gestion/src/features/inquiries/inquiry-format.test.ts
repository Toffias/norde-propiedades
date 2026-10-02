import { describe, expect, it } from 'vitest';

import { formatAge, tagLabel } from './inquiry-format';

describe('formatAge', () => {
  const now = new Date('2026-03-10T15:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('says how long ago the inquiry came in', () => {
    expect(formatAge(ago(20_000), now)).toBe('recién');
    expect(formatAge(ago(5 * 60_000), now)).toBe('hace 5 min');
    expect(formatAge(ago(3 * 3_600_000 + 59 * 60_000), now)).toBe('hace 3 h');
    expect(formatAge(ago(30 * 3_600_000), now)).toBe('hace 1 día');
    expect(formatAge(ago(5 * 86_400_000), now)).toBe('hace 5 días');
  });

  it('treats a future date as just now', () => {
    expect(formatAge(new Date('2026-03-10T16:00:00Z'), now)).toBe('recién');
  });
});

describe('tagLabel', () => {
  it('translates the codes and keeps the neighborhood as is', () => {
    expect(tagLabel({ kind: 'channel', value: 'zonaprop' })).toBe('Zonaprop');
    expect(tagLabel({ kind: 'operation', value: 'rent' })).toBe('Alquiler');
    expect(tagLabel({ kind: 'type', value: 'ph' })).toBe('PH');
    expect(tagLabel({ kind: 'neighborhood', value: 'Villa Crespo' })).toBe('Villa Crespo');
    expect(tagLabel({ kind: 'type', value: 'castle' })).toBe('castle');
  });
});
