import { describe, expect, it } from 'vitest';

import { nonEmpty } from './strings';

describe('nonEmpty', () => {
  it('trims the text and treats blank values as missing', () => {
    expect(nonEmpty('  Hola ')).toBe('Hola');
    expect(nonEmpty('   ')).toBeUndefined();
    expect(nonEmpty(null)).toBeUndefined();
    expect(nonEmpty(undefined)).toBeUndefined();
  });
});
