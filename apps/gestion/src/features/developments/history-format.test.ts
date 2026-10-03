import { describe, expect, it } from 'vitest';

import { formatDevelopmentValue } from './history-format';

const A = '00000000-0000-7000-8000-0000000000a1';
const B = '00000000-0000-7000-8000-0000000000a2';
const C = '00000000-0000-7000-8000-0000000000a3';

describe('formatDevelopmentValue', () => {
  it('shows the chances as the number of agents and their weights', () => {
    expect(formatDevelopmentValue('chances', [])).toBe('Sin derivación');
    expect(formatDevelopmentValue('chances', [{ userId: A, weight: 3 }])).toBe('1 agente (peso 3)');
    expect(
      formatDevelopmentValue('chances', [
        { userId: A, weight: 2 },
        { userId: B, weight: 1 },
        { userId: C, weight: 1 },
      ]),
    ).toBe('3 agentes (pesos 2, 1 y 1)');
  });

  it('shows the delivery date and the labels of the values', () => {
    expect(formatDevelopmentValue('status', 'marketing')).toBe('Comercializando');
  });
});
