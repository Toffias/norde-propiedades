import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { aPropertyRecord, InMemoryPropertySearchQuery } from '../../testing';

import { GetPropertyDetail } from './get-property-detail';
import { SearchProperties } from './search-properties';

const reader = Actor.system('agent-ia', ['properties:read']);
const nobody = Actor.system('agent-ia', []);

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
    });
  });

  it('translates pages into offset and limit', async () => {
    const properties = new InMemoryPropertySearchQuery();

    await new SearchProperties({ properties }).execute({ page: 3, pageSize: 5 }, reader);

    expect(properties.criteria[0]).toMatchObject({ offset: 10, limit: 5 });
  });

  it('maps prices, expenses and the cover image', async () => {
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({
        priceCents: 15_000_000n,
        currency: 'USD',
        expensesCents: 9_500_000n,
        imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      }),
    ]);

    const result = await new SearchProperties({ properties }).execute({}, reader);
    const [item] = result.isOk() ? result.value.items : [];

    expect(item).toMatchObject({
      price: { amountCents: 15_000_000n, currency: 'USD' },
      expenses: { amountCents: 9_500_000n, currency: 'ARS' },
      coverImageUrl: 'https://example.com/a.jpg',
      photoCount: 2,
    });
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
  it('returns the public detail, hiding the exact address when not allowed', async () => {
    const property = aPropertyRecord({ description: 'Luminoso', showExactAddress: false });
    const useCase = new GetPropertyDetail({
      properties: new InMemoryPropertySearchQuery([property]),
    });

    const result = await useCase.execute({ propertyId: property.id }, reader);

    expect(result.isOk() && result.value).toMatchObject({
      id: property.id,
      description: 'Luminoso',
      address: null,
    });
  });

  it('treats unlisted, unknown and malformed ids as not found', async () => {
    const hidden = aPropertyRecord({ status: 'sold' });
    const useCase = new GetPropertyDetail({
      properties: new InMemoryPropertySearchQuery([hidden]),
    });

    for (const propertyId of [hidden.id, '00000000-0000-7000-8000-999999999999', 'P-001']) {
      const result = await useCase.execute({ propertyId }, reader);
      expect(result.isErr() && result.error).toEqual({ type: 'PropertyNotFound' });
    }
  });

  it('requires properties:read', async () => {
    const useCase = new GetPropertyDetail({ properties: new InMemoryPropertySearchQuery() });

    const result = await useCase.execute({ propertyId: 'x' }, nobody);

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
