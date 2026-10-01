import { describe, expect, it } from 'vitest';

import { initials } from './initials';
import { isActivePath } from './nav';

describe('isActivePath', () => {
  it('matches the exact route', () => {
    expect(isActivePath('/propiedades', '/propiedades')).toBe(true);
  });

  it('matches the routes below it', () => {
    expect(isActivePath('/propiedades/123', '/propiedades')).toBe(true);
  });

  it('does not match a route that only shares the prefix', () => {
    expect(isActivePath('/propiedades-destacadas', '/propiedades')).toBe(false);
  });

  it('treats the root as active only on the root', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/clientes', '/')).toBe(false);
  });
});

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Ana María Pérez')).toBe('AP');
  });

  it('uses a single letter for a single word', () => {
    expect(initials('  ana ')).toBe('A');
  });

  it('returns an empty string for a blank name', () => {
    expect(initials('   ')).toBe('');
  });
});
