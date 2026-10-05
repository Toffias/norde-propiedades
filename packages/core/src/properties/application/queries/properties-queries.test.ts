import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { aPropertyMediaRecord, aPropertyRecord, InMemoryPropertySearchQuery } from '../../testing';

import { GetPropertyDetail } from './get-property-detail';
import { SearchProperties } from './search-properties';

const reader = Actor.system('web', ['properties:read']);
const nobody = Actor.system('web', []);

const sale = {
  operation: 'sale',
  priceCents: 15_000_000n,
  currency: 'USD',
  priceOnRequest: false,
} as const;
const rent = {
  operation: 'rent',
  priceCents: 60_000_000n,
  currency: 'ARS',
  priceOnRequest: false,
} as const;

describe('SearchProperties', () => {
  it('returns a page of publicly listed properties', async () => {
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({ title: 'Disponible' }),
      aPropertyRecord({ title: 'Reservada', status: 'reserved' }),
      aPropertyRecord({ title: 'Oculta', publishedOnWeb: false }),
    ]);

    const result = await new SearchProperties({ properties }).execute({}, reader);

    expect(result.isOk() && result.value).toMatchObject({ total: 1, page: 1, pageSize: 3 });
    expect(result.isOk() && result.value.items.map((p) => p.title)).toEqual(['Disponible']);
    expect(properties.criteria[0]).toMatchObject({
      statuses: ['available'],
      publishedOnWebOnly: true,
      sort: 'featured',
    });
  });

  it('translates pages into offset and limit and passes the filters and sort', async () => {
    const properties = new InMemoryPropertySearchQuery();
    const locationId = '00000000-0000-7000-8000-0000000000d1';

    await new SearchProperties({ properties }).execute(
      { page: 3, pageSize: 5, locationId, sort: 'price_asc', creditEligible: true },
      reader,
    );

    expect(properties.criteria[0]).toMatchObject({
      offset: 10,
      limit: 5,
      locationId,
      sort: 'price_asc',
      creditEligible: true,
    });
  });

  it('shows the searched operation first, with every operation and its public price', async () => {
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({ operations: [sale, rent], expensesCents: 9_500_000n }),
    ]);

    const result = await new SearchProperties({ properties }).execute(
      { operation: 'rent' },
      reader,
    );
    const [item] = result.isOk() ? result.value.items : [];

    expect(item).toMatchObject({
      operation: 'rent',
      price: { amountCents: 60_000_000n, currency: 'ARS' },
      operations: [
        { operation: 'sale', price: { amountCents: 15_000_000n, currency: 'USD' } },
        { operation: 'rent', price: { amountCents: 60_000_000n, currency: 'ARS' } },
      ],
      expenses: { amountCents: 9_500_000n, currency: 'ARS' },
    });
  });

  it('hides prices when the property does not show them on the web', async () => {
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({ operations: [sale], showPriceOnWeb: false }),
    ]);

    const result = await new SearchProperties({ properties }).execute({}, reader);
    const [item] = result.isOk() ? result.value.items : [];

    expect(item).toMatchObject({ operation: 'sale', price: null });
  });

  it('publishes only the public photos, with a versioned path', async () => {
    const updatedAt = new Date('2026-10-02T00:00:00Z');
    const cover = aPropertyMediaRecord({ updatedAt });
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({
        media: [
          cover,
          aPropertyMediaRecord({ showOnWeb: false }),
          aPropertyMediaRecord({ processing: 'pending' }),
          aPropertyMediaRecord({ kind: 'floor_plan' }),
        ],
      }),
    ]);

    const result = await new SearchProperties({ properties }).execute({}, reader);
    const [item] = result.isOk() ? result.value.items : [];

    expect(item?.photoCount).toBe(1);
    expect(item?.cover).toEqual({
      id: cover.id,
      src: `/fotos/${cover.id}/${updatedAt.getTime().toString(36)}`,
      width: 1600,
      height: 1200,
      description: null,
    });
  });

  it('lists only the amenities among the features', async () => {
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({
        features: [
          { kind: 'service', name: 'Gas natural' },
          { kind: 'amenity', name: 'Pileta' },
        ],
      }),
    ]);

    const result = await new SearchProperties({ properties }).execute({}, reader);

    expect(result.isOk() && result.value.items[0]?.amenities).toEqual(['Pileta']);
  });

  it('rejects invalid searches', async () => {
    const result = await new SearchProperties({
      properties: new InMemoryPropertySearchQuery(),
    }).execute({ pageSize: 50 }, reader);

    expect(result.isErr() && result.error.type).toBe('InvalidSearch');
  });

  it('requires properties:read', async () => {
    const result = await new SearchProperties({
      properties: new InMemoryPropertySearchQuery(),
    }).execute({}, nobody);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});

describe('GetPropertyDetail', () => {
  it('finds the public detail by id or by slug', async () => {
    const property = aPropertyRecord({ description: 'Luminoso' });
    const useCase = new GetPropertyDetail({
      properties: new InMemoryPropertySearchQuery([property]),
    });

    const byId = await useCase.execute({ propertyId: property.id }, reader);
    const bySlug = await useCase.execute({ slug: property.slug }, reader);

    expect(byId.isOk() && byId.value).toMatchObject({ id: property.id, description: 'Luminoso' });
    expect(bySlug.isOk() && bySlug.value.id).toBe(property.id);
  });

  it('publishes the approximate address and coordinates unless the exact ones are allowed', async () => {
    const coordinates = { latitude: -34.588123, longitude: -58.430987 };
    const hidden = aPropertyRecord({ ...coordinates, showExactAddress: false });
    const exact = aPropertyRecord({ ...coordinates, showExactAddress: true });
    const useCase = new GetPropertyDetail({
      properties: new InMemoryPropertySearchQuery([hidden, exact]),
    });

    const approximate = await useCase.execute({ propertyId: hidden.id }, reader);
    const precise = await useCase.execute({ propertyId: exact.id }, reader);

    expect(approximate.isOk() && approximate.value).toMatchObject({
      address: 'Gurruchaga al 1800',
      coordinates: { latitude: -34.588, longitude: -58.431, exact: false },
    });
    expect(precise.isOk() && precise.value).toMatchObject({
      address: 'Gurruchaga 1834',
      coordinates: { ...coordinates, exact: true },
    });
  });

  it('splits photos, floor plans, videos and tours', async () => {
    const plan = aPropertyMediaRecord({ kind: 'floor_plan' });
    const video = aPropertyMediaRecord({
      kind: 'video',
      storageKey: null,
      externalUrl: 'https://youtu.be/abc',
      variants: {},
    });
    const tour = aPropertyMediaRecord({
      kind: 'tour_360',
      storageKey: null,
      externalUrl: 'https://my.matterport.com/show/?m=1',
      variants: {},
    });
    const property = aPropertyRecord({ media: [aPropertyMediaRecord(), plan, video, tour] });
    const useCase = new GetPropertyDetail({
      properties: new InMemoryPropertySearchQuery([property]),
    });

    const result = await useCase.execute({ propertyId: property.id }, reader);

    expect(result.isOk() && result.value.photos).toHaveLength(1);
    expect(result.isOk() && result.value.floorPlans.map((p) => p.id)).toEqual([plan.id]);
    expect(result.isOk() && result.value.videoUrls).toEqual(['https://youtu.be/abc']);
    expect(result.isOk() && result.value.tourUrls).toEqual(['https://my.matterport.com/show/?m=1']);
  });

  it('tells apart unknown properties from properties no longer listed', async () => {
    const sold = aPropertyRecord({ status: 'sold' });
    const unpublished = aPropertyRecord({ publishedOnWeb: false });
    const withoutOperations = aPropertyRecord({ operations: [] });
    const useCase = new GetPropertyDetail({
      properties: new InMemoryPropertySearchQuery([sold, unpublished, withoutOperations]),
    });

    for (const property of [sold, unpublished, withoutOperations]) {
      const result = await useCase.execute({ slug: property.slug }, reader);
      expect(result.isErr() && result.error).toEqual({ type: 'PropertyNotListed' });
    }
    for (const input of [
      { propertyId: '00000000-0000-7000-8000-999999999999' },
      { propertyId: 'P-001' },
      { slug: 'no-existe' },
      { slug: '' },
    ]) {
      const result = await useCase.execute(input, reader);
      expect(result.isErr() && result.error).toEqual({ type: 'PropertyNotFound' });
    }
  });

  it('requires properties:read', async () => {
    const useCase = new GetPropertyDetail({ properties: new InMemoryPropertySearchQuery() });

    const result = await useCase.execute({ propertyId: 'x' }, nobody);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
