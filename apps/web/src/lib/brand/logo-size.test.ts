import { describe, expect, it } from 'vitest';

import { LOGO_HEIGHT_LIMITS, toLogoSizes } from './logo-size';

describe('toLogoSizes', () => {
  it('uses the default heights when Norde has not set any', () => {
    expect(toLogoSizes(null)).toEqual({ header: { desktop: 48, mobile: 38 }, footer: 56 });
    expect(toLogoSizes({ headerLogoHeight: null, footerLogoHeight: null })).toEqual(
      toLogoSizes(null),
    );
  });

  it('uses the chosen heights and shrinks the header logo on mobile', () => {
    expect(toLogoSizes({ headerLogoHeight: 36, footerLogoHeight: 44 })).toEqual({
      header: { desktop: 36, mobile: 29 },
      footer: 44,
    });
  });

  it('keeps the heights within the limits and rounds them', () => {
    const tooBig = toLogoSizes({ headerLogoHeight: 500, footerLogoHeight: 500 });
    expect(tooBig.header.desktop).toBe(LOGO_HEIGHT_LIMITS.header.max);
    expect(tooBig.footer).toBe(LOGO_HEIGHT_LIMITS.footer.max);

    const tooSmall = toLogoSizes({ headerLogoHeight: 1, footerLogoHeight: 1.4 });
    expect(tooSmall.header.desktop).toBe(LOGO_HEIGHT_LIMITS.header.min);
    expect(tooSmall.footer).toBe(LOGO_HEIGHT_LIMITS.footer.min);

    expect(toLogoSizes({ headerLogoHeight: 40.6 }).header.desktop).toBe(41);
  });
});
