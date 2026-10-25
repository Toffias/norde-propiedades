import { describe, expect, it } from 'vitest';

import { unverifiedAmounts } from './price-guard';

const seen = [
  { role: 'user', content: 'busco hasta USD 130000' },
  { type: 'function_call_result', output: { type: 'text', text: '{"price":"USD 120.000"}' } },
];

describe('unverifiedAmounts', () => {
  it('accepts amounts from the tools or the client, in any format', () => {
    expect(unverifiedAmounts('Está USD 120.000, dentro de tus U$S 130.000', seen)).toEqual([]);
  });

  it('returns amounts nobody mentioned', () => {
    expect(unverifiedAmounts('Te la dejan en USD 99.000 y expensas $ 85.000', seen)).toEqual([
      'USD 99.000',
      '$ 85.000',
    ]);
  });

  it('does not confuse a number with a longer one that contains it', () => {
    expect(unverifiedAmounts('USD 12.000', seen)).toEqual(['USD 12.000']);
  });
});
