import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryPortalAdLookup } from '../../testing';

import { FindPropertyByPortalAd } from './find-property-by-portal-ad';

const agent = Actor.system('agent-ia', ['properties:read']);

function setup() {
  const ads = new InMemoryPortalAdLookup();
  ads.ads.set('zonaprop:54321678', 'property-1');
  return new FindPropertyByPortalAd({ ads });
}

describe('FindPropertyByPortalAd', () => {
  it('finds the property of a portal ad', async () => {
    const result = await setup().execute(
      { reference: 'https://www.zonaprop.com.ar/propiedades/clasificado/x-54321678.html' },
      agent,
    );

    expect(unwrap(result)).toEqual({ propertyId: 'property-1' });
  });

  it('tells an ad of someone else apart from text that is not an ad', async () => {
    const find = setup();

    expect(unwrapErr(await find.execute({ reference: 'MLA111111111' }, agent))).toEqual({
      type: 'PortalAdNotFound',
    });
    expect(unwrapErr(await find.execute({ reference: 'la de Palermo' }, agent))).toEqual({
      type: 'NotAPortalAd',
    });
  });

  it('requires reading properties', async () => {
    const result = await setup().execute(
      { reference: 'MLA111111111' },
      Actor.system('scheduler', ['clients:read']),
    );

    expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
  });
});
