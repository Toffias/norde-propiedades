import { describe, expect, it } from 'vitest';

import { parsePortalAdReference } from './portal-ad-reference';

describe('parsePortalAdReference', () => {
  it('reads a MercadoLibre item from its link or its code', () => {
    const item = { provider: 'mercadolibre', itemId: 'MLA3879350706' };

    expect(
      parsePortalAdReference(
        'https://departamento.mercadolibre.com.ar/MLA-3879350706-departamento-en-venta',
      ),
    ).toEqual(item);
    expect(parsePortalAdReference('el aviso mla3879350706')).toEqual(item);
  });

  it('reads a Zonaprop posting from its link', () => {
    expect(
      parsePortalAdReference(
        'https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-2-amb-palermo-54321678.html',
      ),
    ).toEqual({ provider: 'zonaprop', postingId: '54321678' });
  });

  it('reads a bare number only when the portal is known', () => {
    expect(parsePortalAdReference('aviso 54321678', 'zonaprop')).toEqual({
      provider: 'zonaprop',
      postingId: '54321678',
    });
    expect(parsePortalAdReference('3879350706', 'mercadolibre')).toEqual({
      provider: 'mercadolibre',
      itemId: 'MLA3879350706',
    });
    expect(parsePortalAdReference('54321678')).toBeUndefined();
  });

  it('does not take other links or codes as ads', () => {
    expect(
      parsePortalAdReference('https://norde.com.ar/propiedades/2-amb-palermo'),
    ).toBeUndefined();
    expect(parsePortalAdReference('DEP0001', 'zonaprop')).toBeUndefined();
  });
});
