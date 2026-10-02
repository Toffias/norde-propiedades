import { describe, expect, it } from 'vitest';

import { navigationWithCounts } from './navigation';

function item(href: string, counts: Parameters<typeof navigationWithCounts>[0]) {
  return navigationWithCounts(counts)
    .flatMap((group) => group.items)
    .find((entry) => entry.href === href);
}

describe('navigationWithCounts', () => {
  it('labels each counter by what it counts', () => {
    expect(item('/oportunidades', { '/oportunidades': 2 })).toMatchObject({
      count: 2,
      countLabel: '2 nuevas asignadas',
    });
    expect(item('/consultas', { '/consultas': 1 })).toMatchObject({
      count: 1,
      countLabel: '1 sin asignar',
    });
  });

  it('shows no counter at zero', () => {
    expect(item('/consultas', { '/consultas': 0 })).not.toHaveProperty('count');
  });
});
