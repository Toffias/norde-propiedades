import { describe, expect, it } from 'vitest';

import { brandColor, withBrandColor } from './brand';
import { PDF_COLORS } from './theme';

describe('brand color of a PDF', () => {
  it("is Norde's red outside a render", () => {
    expect(brandColor()).toBe(PDF_COLORS.brand);
  });

  it('belongs to each render, even when several run at the same time', async () => {
    const read = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return brandColor();
    };

    const colors = await Promise.all([
      withBrandColor('#1f4e79', read),
      withBrandColor('#2e7d32', read),
    ]);

    expect(colors).toEqual(['#1f4e79', '#2e7d32']);
    expect(brandColor()).toBe(PDF_COLORS.brand);
  });
});
