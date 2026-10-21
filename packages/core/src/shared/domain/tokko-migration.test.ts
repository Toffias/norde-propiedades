import { describe, expect, it } from 'vitest';

import { isTokkoUnassignedAgent } from './tokko-migration';

describe('isTokkoUnassignedAgent', () => {
  it('recognizes the Tokko pools of contacts without agent, however written', () => {
    expect(isTokkoUnassignedAgent('Libre')).toBe(true);
    expect(isTokkoUnassignedAgent(' SIN  ASIGNAR ')).toBe(true);
    expect(isTokkoUnassignedAgent('Sin Asignár')).toBe(true);
    expect(isTokkoUnassignedAgent('Mariela Parodi')).toBe(false);
    expect(isTokkoUnassignedAgent('Libre Comercio')).toBe(false);
  });
});
