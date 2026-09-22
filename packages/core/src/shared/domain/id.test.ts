import { describe, expect, it } from 'vitest';

import { parseId } from './id';

describe('parseId', () => {
  it('accepts a UUID and normalizes it to lowercase', () => {
    const result = parseId<'Property'>('0199A8B2-3C4D-7E5F-8A6B-7C8D9E0F1A2B');

    expect(result.isOk() && result.value).toBe('0199a8b2-3c4d-7e5f-8a6b-7c8d9e0f1a2b');
  });

  it.each([
    '',
    'not-a-uuid',
    '0199a8b2-3c4d-7e5f-8a6b-7c8d9e0f1a2',
    '0199a8b2-3c4d-0e5f-8a6b-7c8d9e0f1a2b',
  ])('rejects %j', (raw) => {
    const result = parseId(raw);

    expect(result.isErr() && result.error).toEqual({ type: 'InvalidId', value: raw });
  });
});
