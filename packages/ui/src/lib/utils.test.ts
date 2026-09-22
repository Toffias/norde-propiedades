import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('joins conditional classes', () => {
    expect(cn('a', undefined, null, { b: false, c: true })).toBe('a c');
  });

  it('lets the last conflicting Tailwind class win', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });
});
