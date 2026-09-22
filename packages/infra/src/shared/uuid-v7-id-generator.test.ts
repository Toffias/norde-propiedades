import { parseId } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { UuidV7IdGenerator } from './uuid-v7-id-generator';

describe('UuidV7IdGenerator', () => {
  const ids = new UuidV7IdGenerator();

  it('generates ids accepted by the core', () => {
    const id = ids.next();

    expect(parseId(id).isOk()).toBe(true);
    expect(id[14]).toBe('7');
  });

  it('generates time-ordered ids', () => {
    const generated = Array.from({ length: 50 }, () => ids.next());

    expect([...generated].sort()).toEqual(generated);
  });
});
