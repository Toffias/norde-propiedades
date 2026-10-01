import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { MAX_MAP_PINS } from '../../contracts';
import {
  aPanelItem,
  InMemoryUserNames,
  PRODUCER_ID,
  StubPanelPropertyListQuery,
  StubPropertyCatalogQuery,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import { CompareProperties } from './compare-properties';
import { GetPropertyConfiguration } from './get-property-configuration';
import { GetPropertyMap } from './get-property-map';
import { ListFavoriteSearches } from './list-favorite-searches';
import { ListFeatures } from './list-features';
import { SearchLocations } from './search-locations';
import { SearchTags } from './search-tags';

const A = '00000000-0000-7000-8000-0000000000c1';
const B = '00000000-0000-7000-8000-0000000000c2';
const AREA = { south: '-34.7', west: '-58.6', north: '-34.5', east: '-58.3' };

describe('GetPropertyMap', () => {
  it('returns the pins with coordinates inside the area and says when there are more', async () => {
    const properties = new StubPanelPropertyListQuery({
      items: [
        aPanelItem({ id: A, coordinates: { latitude: -34.58, longitude: -58.43 } }),
        aPanelItem({ id: B, coordinates: undefined }),
      ],
      total: 640,
    });
    const map = new GetPropertyMap({ properties });

    const result = unwrap(await map.execute({ ...AREA, status: 'available' }, TEST_PRODUCER));

    expect(result.pins).toEqual([
      expect.objectContaining({ id: A, latitude: -34.58, longitude: -58.43 }),
    ]);
    expect(result).toMatchObject({ total: 640, truncated: true });
    expect(properties.mapCalls).toEqual([
      { area: { south: -34.7, west: -58.6, north: -34.5, east: -58.3 }, limit: MAX_MAP_PINS },
    ]);
  });

  it('rejects an inverted area and an actor without permission', async () => {
    const map = new GetPropertyMap({ properties: new StubPanelPropertyListQuery() });
    expect(unwrapErr(await map.execute({ ...AREA, south: '-34.4' }, TEST_PRODUCER)).type).toBe(
      'InvalidSearch',
    );
    expect(unwrapErr(await map.execute(AREA, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('CompareProperties', () => {
  it('returns the chosen properties in the order they were picked, with names', async () => {
    const properties = new StubPanelPropertyListQuery({
      items: [aPanelItem({ id: A, code: 'DEP0001' }), aPanelItem({ id: B, code: 'DEP0002' })],
      total: 2,
    });
    const compare = new CompareProperties({
      properties,
      users: new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ruiz']])),
    });

    const rows = unwrap(await compare.execute({ ids: `${B},${A}` }, TEST_PRODUCER));

    expect(rows.map((row) => row.code)).toEqual(['DEP0002', 'DEP0001']);
    expect(rows[0]?.producer).toEqual({ id: PRODUCER_ID, name: 'Camila Ruiz' });
    expect(properties.calls[0]).toMatchObject({ ids: [B, A], view: 'active', limit: 4 });
  });

  it('compares between two and four properties', async () => {
    const compare = new CompareProperties({
      properties: new StubPanelPropertyListQuery(),
      users: new InMemoryUserNames(),
    });
    expect(unwrapErr(await compare.execute({ ids: A }, TEST_PRODUCER)).type).toBe('InvalidSearch');
    expect(unwrapErr(await compare.execute({ ids: `${A},${B}` }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('catalog queries', () => {
  it('pass the filters and the page to the catalog query', async () => {
    const catalog = new StubPropertyCatalogQuery();
    unwrap(
      await new SearchLocations({ catalog }).execute(
        { q: 'palermo', kind: 'neighborhood', page: '2', pageSize: '10' },
        TEST_PRODUCER,
      ),
    );
    unwrap(
      await new ListFeatures({ catalog }).execute(
        { kind: 'amenity', state: 'active' },
        TEST_PRODUCER,
      ),
    );
    unwrap(await new SearchTags({ catalog }).execute({ group: 'none' }, TEST_PRODUCER));
    unwrap(await new ListFavoriteSearches({ catalog }).execute({}, TEST_PRODUCER));

    expect(catalog.calls.map((call) => call.method)).toEqual([
      'searchLocations',
      'listFeatures',
      'searchTags',
      'listFavoriteSearches',
    ]);
    expect(catalog.calls[0]?.criteria).toEqual({
      text: 'palermo',
      parentId: undefined,
      kind: 'neighborhood',
      direction: 'asc',
      offset: 10,
      limit: 10,
    });
    expect(catalog.calls[1]?.criteria).toMatchObject({ kind: 'amenity', active: true });
    expect(catalog.calls[2]?.criteria).toMatchObject({ groupId: null });
    expect(catalog.calls[3]?.criteria).toMatchObject({ userId: TEST_PRODUCER.id });
  });

  it('need properties:read', async () => {
    const catalog = new StubPropertyCatalogQuery();
    expect(unwrapErr(await new SearchLocations({ catalog }).execute({}, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
    expect(
      unwrapErr(await new GetPropertyConfiguration({ catalog }).execute(TEST_OUTSIDER)),
    ).toEqual({ type: 'Forbidden' });
  });

  it('returns the type settings with the recommended attributes', async () => {
    const catalog = new StubPropertyCatalogQuery();
    catalog.typeSettingRows = [{ kind: 'land', isEnabled: false, visibleAttributes: ['frontM'] }];
    catalog.gridColumnRows = ['rooms'];
    const config = unwrap(
      await new GetPropertyConfiguration({ catalog }).execute(
        Actor.user(PRODUCER_ID, ['settings:read']),
      ),
    );
    expect(config.gridColumns).toEqual(['rooms']);
    expect(config.types[0]).toMatchObject({
      propertyType: 'land',
      isEnabled: false,
      visibleAttributes: ['frontM'],
    });
    expect(config.types[0]?.recommendedAttributes).toContain('surfaceLandM2');
  });
});
