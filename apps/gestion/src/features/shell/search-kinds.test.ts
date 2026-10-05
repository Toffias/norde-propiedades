import { describe, expect, it } from 'vitest';

import { parseSearchKinds, serializeSearchKinds } from './search-kinds';

describe('parseSearchKinds', () => {
  it('searches everything without a cookie', () => {
    expect(parseSearchKinds(undefined)).toEqual([]);
  });

  it('keeps the known kinds in a fixed order', () => {
    expect(parseSearchKinds('agents,clients')).toEqual(['clients', 'agents']);
  });

  it('drops unknown kinds', () => {
    expect(parseSearchKinds('tasks,properties,')).toEqual(['properties']);
  });

  it('reads back what it writes', () => {
    expect(parseSearchKinds(serializeSearchKinds(['developments', 'agents']))).toEqual([
      'developments',
      'agents',
    ]);
  });
});
