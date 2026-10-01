import { describe, expect, it } from 'vitest';

import { blankToUndefined } from './form';

describe('blankToUndefined', () => {
  it('turns blank strings into undefined', () => {
    expect(blankToUndefined({ name: '', email: '   ', phone: '+54 11' })).toEqual({
      name: undefined,
      email: undefined,
      phone: '+54 11',
    });
  });

  it('walks nested objects and arrays', () => {
    expect(blankToUndefined({ opportunity: { note: '' }, tags: ['a', ' '] })).toEqual({
      opportunity: { note: undefined },
      tags: ['a', undefined],
    });
  });

  it('leaves other values untouched', () => {
    const date = new Date(0);
    expect(blankToUndefined({ rooms: 0, active: false, at: date, none: null })).toEqual({
      rooms: 0,
      active: false,
      at: date,
      none: null,
    });
  });
});
