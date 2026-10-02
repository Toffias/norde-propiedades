import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  aPanelItem,
  InMemoryUserNames,
  PRODUCER_ID,
  PROPERTY_ID,
  StubPanelPropertyListQuery,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';

import { GetPropertySummaries } from './get-property-summaries';
import { ListOwnedProperties } from './list-owned-properties';

const CLIENT_ID = '00000000-0000-7000-8000-0000000000d1';
const OTHER_ID = '00000000-0000-7000-8000-0000000000d2';

function setup() {
  const properties = new StubPanelPropertyListQuery({
    items: [aPanelItem({ id: PROPERTY_ID, producerUserId: PRODUCER_ID })],
    total: 1,
  });
  const users = new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ruiz']]));
  return {
    properties,
    owned: new ListOwnedProperties({ properties, users }),
    summaries: new GetPropertySummaries({ properties, users }),
  };
}

describe('ListOwnedProperties', () => {
  it('lists the active portfolio of the owner, paginated in the query', async () => {
    const { properties, owned } = setup();

    const page = unwrap(
      await owned.execute(
        { clientId: CLIENT_ID.toUpperCase(), page: '2', pageSize: '10', sort: 'code' },
        TEST_PRODUCER,
      ),
    );

    expect(properties.calls).toEqual([
      expect.objectContaining({
        view: 'active',
        owner: { kind: 'all' },
        ids: undefined,
        ownerClientId: CLIENT_ID,
        sort: { field: 'code', direction: 'asc' },
        offset: 10,
        limit: 10,
      }),
    ]);
    expect(page.items[0]?.producer).toEqual({ id: PRODUCER_ID, name: 'Camila Ruiz' });
  });

  it('rejects an unknown sort and an actor without properties:read', async () => {
    const { owned } = setup();

    expect(
      unwrapErr(await owned.execute({ clientId: CLIENT_ID, sort: 'price' }, TEST_PRODUCER)),
    ).toMatchObject({ type: 'InvalidSearch' });
    expect(unwrapErr(await owned.execute({ clientId: CLIENT_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('GetPropertySummaries', () => {
  it('returns only the properties of the portfolio among the requested ones', async () => {
    const { properties, summaries } = setup();

    const rows = unwrap(await summaries.execute({ ids: [PROPERTY_ID, OTHER_ID] }, TEST_PRODUCER));

    expect(rows.map((row) => row.id)).toEqual([PROPERTY_ID]);
    expect(properties.calls[0]).toMatchObject({ view: 'active', ids: [PROPERTY_ID, OTHER_ID] });
  });

  it('does not query for an empty page and needs properties:read', async () => {
    const { properties, summaries } = setup();

    expect(unwrap(await summaries.execute({ ids: [] }, TEST_PRODUCER))).toEqual([]);
    expect(properties.calls).toEqual([]);
    expect(unwrapErr(await summaries.execute({ ids: [PROPERTY_ID] }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});
