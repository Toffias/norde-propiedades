import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  aPropertyMediaRecord,
  aPropertyRecord,
  aPublishedDevelopmentRecord,
  InMemoryPropertySearchQuery,
  InMemoryPublishedDevelopmentQuery,
} from '../../testing';

import { GetPublishedDevelopment } from './get-published-development';
import { SearchProperties } from './search-properties';
import { SearchPublishedDevelopments } from './search-published-developments';

const web = Actor.system('web', ['properties:read']);
const nobody = Actor.system('web', []);

describe('SearchPublishedDevelopments', () => {
  it('returns a page of the developments being marketed', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery([
      aPublishedDevelopmentRecord({ name: 'Torre Gurruchaga' }),
      aPublishedDevelopmentRecord({ name: 'Cargando', status: 'loading' }),
      aPublishedDevelopmentRecord({ name: 'Borrado', deletedAt: new Date('2026-10-01') }),
    ]);

    const page = unwrap(await new SearchPublishedDevelopments({ developments }).execute({}, web));

    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 12 });
    expect(page.items.map((d) => d.name)).toEqual(['Torre Gurruchaga']);
    expect(developments.criteria[0]).toMatchObject({
      statuses: ['marketing'],
      unitStatuses: ['available'],
      sort: 'newest',
      offset: 0,
      limit: 12,
    });
  });

  it('translates pages into offset and limit and passes the filters and sort', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery();

    await new SearchPublishedDevelopments({ developments }).execute(
      {
        page: 3,
        pageSize: 6,
        developmentType: 'gated_community',
        constructionStatus: 'pre_sale',
        sort: 'delivery_asc',
      },
      web,
    );

    expect(developments.criteria[0]).toMatchObject({
      offset: 12,
      limit: 6,
      developmentType: 'gated_community',
      constructionStatus: 'pre_sale',
      sort: 'delivery_asc',
    });
  });

  it('maps the public card: approximate address, place, units and price from', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery([
      aPublishedDevelopmentRecord({
        listedUnitCount: 4,
        unitPricesFrom: [
          { currency: 'ARS', amountCents: 100n },
          { currency: 'USD', amountCents: 9_500_000n },
        ],
      }),
    ]);

    const [card] = unwrap(
      await new SearchPublishedDevelopments({ developments }).execute({}, web),
    ).items;

    expect(card).toMatchObject({
      address: 'Gurruchaga al 1800',
      neighborhood: 'Palermo',
      city: 'CABA',
      availableUnitCount: 4,
      priceFrom: { currency: 'USD', amountCents: 9_500_000n },
      photoCount: 1,
    });
    expect(card?.cover?.src).toMatch(/^\/fotos\//);
  });

  it('rejects a page size over the public maximum', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery();
    const error = unwrapErr(
      await new SearchPublishedDevelopments({ developments }).execute({ pageSize: 100 }, web),
    );
    expect(error.type).toBe('InvalidSearch');
    expect(developments.criteria).toHaveLength(0);
  });

  it('needs properties:read', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery();
    expect(
      unwrapErr(await new SearchPublishedDevelopments({ developments }).execute({}, nobody)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('GetPublishedDevelopment', () => {
  it('returns the public detail by slug, without the exact location', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery([
      aPublishedDevelopmentRecord({
        slug: 'torre-gurruchaga-e-001',
        latitude: -34.588_123,
        longitude: -58.430_987,
        financingDetails: '  ',
        isFinanced: true,
        media: [
          aPropertyMediaRecord(),
          aPropertyMediaRecord({ kind: 'floor_plan' }),
          aPropertyMediaRecord({
            kind: 'video',
            storageKey: null,
            externalUrl: 'https://youtu.be/x',
          }),
          aPropertyMediaRecord({ showOnWeb: false }),
        ],
      }),
    ]);

    const detail = unwrap(
      await new GetPublishedDevelopment({ developments }).execute(
        { slug: 'torre-gurruchaga-e-001' },
        web,
      ),
    );

    expect(detail).toMatchObject({
      province: 'Buenos Aires',
      coordinates: { latitude: -34.588, longitude: -58.431, exact: false },
      financingDetails: null,
      isFinanced: true,
      videoUrls: ['https://youtu.be/x'],
      photoCount: 1,
    });
    expect(detail.photos).toHaveLength(1);
    expect(detail.floorPlans).toHaveLength(1);
  });

  it('tells apart a development that is not offered from one that does not exist', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery([
      aPublishedDevelopmentRecord({ slug: 'cargando', status: 'loading' }),
      aPublishedDevelopmentRecord({ slug: 'borrado', deletedAt: new Date('2026-10-01') }),
    ]);
    const useCase = new GetPublishedDevelopment({ developments });

    expect(unwrapErr(await useCase.execute({ slug: 'cargando' }, web))).toEqual({
      type: 'DevelopmentNotListed',
    });
    expect(unwrapErr(await useCase.execute({ slug: 'borrado' }, web))).toEqual({
      type: 'DevelopmentNotListed',
    });
    expect(unwrapErr(await useCase.execute({ slug: 'no-existe' }, web))).toEqual({
      type: 'DevelopmentNotFound',
    });
    expect(unwrapErr(await useCase.execute({ slug: '' }, web))).toEqual({
      type: 'DevelopmentNotFound',
    });
  });

  it('needs properties:read', async () => {
    const developments = new InMemoryPublishedDevelopmentQuery([aPublishedDevelopmentRecord()]);
    expect(
      unwrapErr(await new GetPublishedDevelopment({ developments }).execute({ slug: 'x' }, nobody)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('SearchProperties by development', () => {
  it('lists only the published units of a development', async () => {
    const developmentId = '00000000-0000-7000-8004-0000000000aa';
    const properties = new InMemoryPropertySearchQuery([
      aPropertyRecord({ title: 'Unidad 1A', developmentId }),
      aPropertyRecord({ title: 'Unidad 2B', developmentId, status: 'reserved' }),
      aPropertyRecord({ title: 'Otra' }),
    ]);

    const page = unwrap(await new SearchProperties({ properties }).execute({ developmentId }, web));

    expect(page.items.map((p) => p.title)).toEqual(['Unidad 1A']);
    expect(properties.criteria[0]).toMatchObject({ developmentId });
  });
});
