import { describe, expect, it } from 'vitest';

import { pickWeighted, type WeightedAgent } from './weighted-distribution';

function sequence(agents: readonly WeightedAgent[], length: number): string[] {
  return Array.from({ length }, (_, i) => pickWeighted(agents, BigInt(i))?.userId ?? '-');
}

describe('pickWeighted', () => {
  it('gives A 2 of every 3 with A=2 and B=1, interleaved', () => {
    const agents = [
      { userId: 'A', weight: 2 },
      { userId: 'B', weight: 1 },
    ];

    expect(sequence(agents, 6)).toEqual(['A', 'B', 'A', 'A', 'B', 'A']);
  });

  it('spreads the heavier agent instead of giving it a run', () => {
    const agents = [
      { userId: 'A', weight: 3 },
      { userId: 'B', weight: 1 },
      { userId: 'C', weight: 1 },
    ];

    expect(sequence(agents, 5)).toEqual(['A', 'B', 'A', 'C', 'A']);
  });

  it('takes turns with equal weights, in the order of the rule', () => {
    const agents = [
      { userId: 'A', weight: 1 },
      { userId: 'B', weight: 1 },
      { userId: 'C', weight: 1 },
    ];

    expect(sequence(agents, 4)).toEqual(['A', 'B', 'C', 'A']);
  });

  it('gives each agent exactly its weight in every round', () => {
    const agents = [
      { userId: 'A', weight: 5 },
      { userId: 'B', weight: 3 },
      { userId: 'C', weight: 2 },
    ];
    const round = sequence(agents, 10);

    expect(round.filter((id) => id === 'A')).toHaveLength(5);
    expect(round.filter((id) => id === 'B')).toHaveLength(3);
    expect(round.filter((id) => id === 'C')).toHaveLength(2);
    // Determinístico: la vuelta siguiente es igual.
    expect(
      Array.from({ length: 10 }, (_, i) => pickWeighted(agents, BigInt(i + 10))?.userId),
    ).toEqual(round);
  });

  it('works with a very large cursor', () => {
    const agents = [
      { userId: 'A', weight: 2 },
      { userId: 'B', weight: 1 },
    ];

    expect(pickWeighted(agents, 3_000_000_000_001n)?.userId).toBe('B');
  });

  it('returns nobody without agents', () => {
    expect(pickWeighted([], 0n)).toBeUndefined();
  });
});
