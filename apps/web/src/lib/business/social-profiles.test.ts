import { describe, expect, it } from 'vitest';

import { socialProfiles } from './social-profiles';

describe('socialProfiles', () => {
  it('recognizes the social networks and keeps their order', () => {
    expect(
      socialProfiles(['https://www.instagram.com/norde', 'https://facebook.com/norde.propiedades']),
    ).toEqual([
      { network: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/norde' },
      { network: 'facebook', label: 'Facebook', url: 'https://facebook.com/norde.propiedades' },
    ]);
  });

  it('leaves out portals and malformed URLs', () => {
    expect(
      socialProfiles(['https://www.zonaprop.com.ar/inmobiliarias/norde', 'no es una url']),
    ).toEqual([]);
  });
});
