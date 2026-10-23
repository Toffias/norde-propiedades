import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import {
  aPropertyRecord,
  InMemoryPropertySearchQuery,
  InMemoryPublicLocationQuery,
} from '../../testing';

import { GetPublicPropertyMap } from './get-public-property-map';
import { SearchPublicLocations } from './search-public-locations';

const reader = Actor.system('web', ['properties:read']);
const nobody = Actor.system('web', []);

const sale = {
  operation: 'sale',
  priceCents: 15_000_000n,
  currency: 'USD',
  priceOnRequest: false,
} as const;

describe('GetPublicPropertyMap', () => {
  it('returns a pin per listed property with coordinates, approximate unless the address is public', async () => {
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({
        title: 'Exacta',
        operations: [sale],
        latitude: -34.612345,
        longitude: -58.456789,
        showExactAddress: true,
      }),
      aPropertyRecord({
        title: 'Aproximada',
        operations: [sale],
        latitude: -34.612345,
        longitude: -58.456789,
        showExactAddress: false,
      }),
      aPropertyRecord({ title: 'Sin coordenadas', operations: [sale] }),
      aPropertyRecord({
        title: 'Reservada',
        status: 'reserved',
        latitude: -34.6,
        longitude: -58.4,
      }),
    ]);

    const result = await new GetPublicPropertyMap({ properties }).execute({}, reader);

    expect(result.isOk() && result.value).toMatchObject({ total: 2, truncated: false });
    const pins = result.isOk() ? result.value.pins : [];
    expect(pins.map((pin) => [pin.title, pin.coordinates])).toEqual([
      ['Exacta', { latitude: -34.612345, longitude: -58.456789, exact: true }],
      ['Aproximada', { latitude: -34.612, longitude: -58.457, exact: false }],
    ]);
    expect(pins[0]).toMatchObject({
      operation: 'sale',
      price: { amountCents: 15_000_000n, currency: 'USD' },
    });
  });

  it('asks for published properties with coordinates, within the area and filters', async () => {
    const properties = new InMemoryPropertySearchQuery();
    const area = { south: -34.7, west: -58.6, north: -34.5, east: -58.3 };
    const locationId = '00000000-0000-7000-8000-0000000000d1';

    await new GetPublicPropertyMap({ properties }).execute(
      { operation: 'rent', locationId, area, minRooms: 2 },
      reader,
    );

    expect(properties.criteria[0]).toMatchObject({
      statuses: ['available'],
      publishedOnWebOnly: true,
      withCoordinates: true,
      operation: 'rent',
      locationId,
      area,
      minRooms: 2,
      offset: 0,
      limit: 300,
    });
  });

  it('rejects an inverted area', async () => {
    const result = await new GetPublicPropertyMap({
      properties: new InMemoryPropertySearchQuery(),
    }).execute({ area: { south: -34.5, west: -58.6, north: -34.7, east: -58.3 } }, reader);

    expect(result.isErr() && result.error.type).toBe('InvalidSearch');
  });

  it('requires reading properties', async () => {
    const result = await new GetPublicPropertyMap({
      properties: new InMemoryPropertySearchQuery(),
    }).execute({}, nobody);

    expect(result.isErr() && result.error.type).toBe('Forbidden');
  });
});

describe('SearchPublicLocations', () => {
  const palermo = {
    id: '00000000-0000-7000-8001-0000000000a1',
    kind: 'neighborhood',
    name: 'Palermo',
    ancestors: ['Argentina', 'CABA', 'CABA'],
    listingCount: 12,
  } as const;
  const ramos = {
    id: '00000000-0000-7000-8001-0000000000a2',
    kind: 'city',
    name: 'Ramos Mejía',
    ancestors: ['Argentina', 'Buenos Aires', 'La Matanza'],
    listingCount: 4,
  } as const;

  it('returns matching locations with their context and listing count', async () => {
    const locations = new InMemoryPublicLocationQuery([palermo, ramos]);

    const result = await new SearchPublicLocations({ locations }).execute({ q: 'ramos' }, reader);

    expect(result.isOk() && result.value).toMatchObject({
      total: 1,
      items: [
        {
          id: ramos.id,
          kind: 'city',
          name: 'Ramos Mejía',
          context: 'La Matanza, Buenos Aires',
          listingCount: 4,
        },
      ],
    });
    expect(locations.criteria[0]).toMatchObject({
      text: 'ramos',
      statuses: ['available'],
      offset: 0,
      limit: 8,
    });
  });

  it('finds the chosen locations by id', async () => {
    const locations = new InMemoryPublicLocationQuery([palermo, ramos]);

    const result = await new SearchPublicLocations({ locations }).execute(
      { ids: [palermo.id] },
      reader,
    );

    expect(result.isOk() && result.value.items.map((l) => l.context)).toEqual(['CABA']);
  });

  it('rejects a one-letter search and a page that is too big', async () => {
    const useCase = new SearchPublicLocations({ locations: new InMemoryPublicLocationQuery() });

    for (const input of [{ q: 'p' }, { q: 'pal', pageSize: 50 }]) {
      const result = await useCase.execute(input, reader);
      expect(result.isErr() && result.error.type).toBe('InvalidSearch');
    }
  });

  it('requires reading properties', async () => {
    const result = await new SearchPublicLocations({
      locations: new InMemoryPublicLocationQuery(),
    }).execute({ q: 'pal' }, nobody);

    expect(result.isErr() && result.error.type).toBe('Forbidden');
  });
});
