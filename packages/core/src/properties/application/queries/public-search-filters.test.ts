import { describe, expect, it } from 'vitest';

import { UsdExchangeRate } from '../../../settings';
import { InMemoryCompanySettingsRepository } from '../../../settings/testing';
import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { aPropertyRecord, InMemoryPropertySearchQuery } from '../../testing';

import { GetPublicSearchFacets } from './get-public-search-facets';
import { SearchProperties } from './search-properties';

const reader = Actor.system('web', ['properties:read']);
const nobody = Actor.system('web', []);

function settingsWithRate(text: string | undefined): InMemoryCompanySettingsRepository {
  const settings = new InMemoryCompanySettingsRepository();
  settings.row = {
    ...settings.row,
    usdExchangeRate: text === undefined ? undefined : unwrap(UsdExchangeRate.fromText(text)),
  };
  return settings;
}

const inDollars = aPropertyRecord({
  title: 'En dólares',
  operations: [
    { operation: 'sale', priceCents: 6_000_000n, currency: 'USD', priceOnRequest: false },
  ],
});
const inPesos = aPropertyRecord({
  title: 'En pesos',
  operations: [
    { operation: 'sale', priceCents: 9_000_000_000n, currency: 'ARS', priceOnRequest: false },
  ],
});

describe('SearchProperties price filter', () => {
  it('includes dollar prices that fit a peso range with the company rate', async () => {
    const properties = new InMemoryPropertySearchQuery([inDollars, inPesos]);
    const search = new SearchProperties({ properties, settings: settingsWithRate('1.450') });

    // Hasta $100.000.000: 60.000 USD son $87.000.000 y $90.000.000 entra tal cual.
    const page = unwrap(
      await search.execute({ currency: 'ARS', maxPriceCents: 10_000_000_000n }, reader),
    );

    expect(page.items.map((i) => i.title).sort()).toEqual(['En dólares', 'En pesos']);
    expect(properties.criteria[0]?.priceBounds).toEqual([
      { currency: 'ARS', maxCents: 10_000_000_000n },
      { currency: 'USD', maxCents: 6_896_551n },
    ]);
  });

  it('includes peso prices that fit a dollar range', async () => {
    const properties = new InMemoryPropertySearchQuery([inDollars, inPesos]);
    const search = new SearchProperties({ properties, settings: settingsWithRate('1.450') });

    const page = unwrap(
      await search.execute({ currency: 'USD', minPriceCents: 6_100_000n }, reader),
    );

    // $90.000.000 son 62.068 USD: entra; 60.000 USD no.
    expect(page.items.map((i) => i.title)).toEqual(['En pesos']);
  });

  it('only searches the requested currency without a rate', async () => {
    const properties = new InMemoryPropertySearchQuery([inDollars, inPesos]);
    const search = new SearchProperties({ properties, settings: settingsWithRate(undefined) });

    const page = unwrap(
      await search.execute({ currency: 'ARS', maxPriceCents: 10_000_000_000n }, reader),
    );

    expect(page.items.map((i) => i.title)).toEqual(['En pesos']);
  });

  it('turns the web options into ranges, the last one meaning "or more"', async () => {
    const properties = new InMemoryPropertySearchQuery();

    await new SearchProperties({ properties }).execute(
      {
        rooms: [4, 2],
        bedrooms: [1],
        bathrooms: [3],
        age: 'up_to_10',
        furnished: true,
        withParking: true,
        maxSurfaceM2: 80,
      },
      reader,
    );

    expect(properties.criteria[0]).toMatchObject({
      roomRanges: [{ min: 2, max: 2 }, { min: 4 }],
      bedroomRanges: [{ min: 1, max: 1 }],
      bathroomRanges: [{ min: 3 }],
      age: { kind: 'years', max: 10 },
      furnished: true,
      withParking: true,
      maxSurfaceM2: 80,
    });
  });

  it('rejects an option out of range', async () => {
    const properties = new InMemoryPropertySearchQuery();
    const result = await new SearchProperties({ properties }).execute({ rooms: [5] }, reader);
    expect(unwrapErr(result)).toMatchObject({ type: 'InvalidSearch' });
  });
});

describe('GetPublicSearchFacets', () => {
  const records = [
    aPropertyRecord({ rooms: 1, bedrooms: null, bathrooms: 1, isFurnished: true }),
    aPropertyRecord({ rooms: 2, bedrooms: 1, bathrooms: 1, parkingSpaces: 1 }),
    aPropertyRecord({
      rooms: 3,
      bedrooms: 2,
      bathrooms: 2,
      features: [{ kind: 'amenity', name: 'Pileta' }],
    }),
    aPropertyRecord({
      rooms: 5,
      bedrooms: 4,
      bathrooms: 3,
      parkingSpaces: 2,
      features: [{ kind: 'amenity', name: 'Pileta' }],
    }),
  ];

  it('counts each option, the last one as "or more"', async () => {
    const facets = unwrap(
      await new GetPublicSearchFacets({
        properties: new InMemoryPropertySearchQuery(records),
      }).execute({}, reader),
    );

    expect(facets.rooms).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 1 },
      { value: 3, count: 1 },
      { value: 4, count: 1 },
    ]);
    expect(facets.bedrooms).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 1 },
      { value: 3, count: 1 },
    ]);
    expect(facets.bathrooms).toEqual([
      { value: 1, count: 2 },
      { value: 2, count: 1 },
      { value: 3, count: 1 },
    ]);
    expect(facets.features).toEqual([{ id: 'Pileta', name: 'Pileta', count: 2 }]);
    expect(facets).toMatchObject({ furnished: 1, withParking: 2 });
  });

  it('counts the rooms without their own filter but with the others', async () => {
    const properties = new InMemoryPropertySearchQuery(records);

    const facets = unwrap(
      await new GetPublicSearchFacets({ properties }).execute(
        { rooms: [1], bathrooms: [1] },
        reader,
      ),
    );

    // Con 1 baño: una de 1 ambiente y una de 2. Elegir "1 ambiente" no achica las demás opciones.
    expect(facets.rooms.map((o) => o.count)).toEqual([1, 1, 0, 0]);
    // Los baños se cuentan con "1 ambiente" puesto.
    expect(facets.bathrooms.map((o) => o.count)).toEqual([1, 0, 0]);
    expect(facets.furnished).toBe(1);
  });

  it('is only for who can read properties', async () => {
    const result = await new GetPublicSearchFacets({
      properties: new InMemoryPropertySearchQuery(),
    }).execute({}, nobody);
    expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
  });
});
