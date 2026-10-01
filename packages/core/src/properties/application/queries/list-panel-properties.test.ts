import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { ListPanelPropertiesQuerySchema } from '../../contracts';
import {
  BRANCH_ID,
  InMemoryUserNames,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  StubPanelPropertyListQuery,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import type { PanelPropertyListItem } from '../ports/panel-property-list-query';
import { ListPanelProperties } from './list-panel-properties';

const ITEM: PanelPropertyListItem = {
  id: PROPERTY_ID,
  code: 'DEP0001',
  propertyType: 'apartment',
  status: 'draft',
  portalTitle: 'Departamento en venta en Palermo',
  publishAddress: 'Gurruchaga al 1800',
  neighborhood: 'Palermo',
  city: 'CABA',
  operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
  producerUserId: PRODUCER_ID,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  deletedAt: TEST_NOW,
  deletedBy: OTHER_USER_ID,
};

function setup(items: readonly PanelPropertyListItem[] = []) {
  const properties = new StubPanelPropertyListQuery({ items, total: 41 });
  const users = new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ruiz']]));
  return { properties, list: new ListPanelProperties({ properties, users }) };
}

describe('ListPanelProperties', () => {
  it('passes the filters, the page and the sort to the query', async () => {
    const { properties, list } = setup();

    const page = unwrap(
      await list.execute(
        {
          page: '2',
          pageSize: '10',
          sort: '-price',
          q: 'gurruchaga',
          operation: 'sale',
          propertyType: 'apartment',
          status: 'available',
          location: 'Palermo',
          currency: 'USD',
          minPrice: '100000',
          maxPrice: '150000,5',
        },
        TEST_PRODUCER,
      ),
    );

    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 41 });
    expect(properties.calls).toEqual([
      {
        view: 'active',
        owner: { kind: 'all' },
        text: 'gurruchaga',
        operation: 'sale',
        propertyType: 'apartment',
        status: 'available',
        location: 'Palermo',
        price: { currency: 'USD', minCents: 10_000_000n, maxCents: 15_000_050n },
        sort: { field: 'price', direction: 'desc' },
        offset: 10,
        limit: 10,
      },
    ]);
  });

  it('accepts a query the page already parsed', async () => {
    const { properties, list } = setup();
    const parsed = ListPanelPropertiesQuerySchema.parse({
      currency: 'ARS',
      minPrice: '1000',
      sort: '-price',
    });
    unwrap(await list.execute(parsed, TEST_PRODUCER));
    expect(properties.calls[0]?.price).toEqual({
      currency: 'ARS',
      minCents: 100_000n,
      maxCents: undefined,
    });
  });

  it('filters by the actor as producer or by their branch', async () => {
    const { properties, list } = setup();
    unwrap(await list.execute({ scope: 'mine' }, TEST_PRODUCER));
    unwrap(await list.execute({ scope: 'branch' }, TEST_PRODUCER));
    expect(properties.calls.map((c) => c.owner)).toEqual([
      { kind: 'producer', userId: PRODUCER_ID },
      { kind: 'branch', branchId: BRANCH_ID },
    ]);
  });

  it('rejects "my branch" for an actor without a branch', async () => {
    const { list } = setup();
    expect(unwrapErr(await list.execute({ scope: 'branch' }, TEST_MANAGER))).toEqual({
      type: 'NoBranchAssigned',
    });
  });

  it('resolves the names of the producer and of who deleted it', async () => {
    const { list } = setup([ITEM]);
    const page = unwrap(await list.execute({ view: 'trash' }, TEST_PRODUCER));
    expect(page.items[0]).toMatchObject({
      producer: { id: PRODUCER_ID, name: 'Camila Ruiz' },
      deletedBy: { id: OTHER_USER_ID, name: undefined },
    });
    expect(page.items[0]).not.toHaveProperty('producerUserId');
  });

  it('requires a currency to filter or sort by price', async () => {
    const { properties, list } = setup();
    expect(unwrapErr(await list.execute({ minPrice: '1000' }, TEST_PRODUCER)).type).toBe(
      'InvalidSearch',
    );
    expect(unwrapErr(await list.execute({ sort: 'price' }, TEST_PRODUCER)).type).toBe(
      'InvalidSearch',
    );
    expect(properties.calls).toEqual([]);
  });

  it('rejects a page size over the maximum', async () => {
    const { list } = setup();
    expect(unwrapErr(await list.execute({ pageSize: '500' }, TEST_PRODUCER)).type).toBe(
      'InvalidSearch',
    );
  });

  it('rejects an actor without permission', async () => {
    const { list } = setup();
    expect(unwrapErr(await list.execute({}, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });

  it('shows the trash only to whoever can delete', async () => {
    const { list } = setup();
    const reader = Actor.user(PRODUCER_ID, ['properties:read']);
    expect(unwrapErr(await list.execute({ view: 'trash' }, reader))).toEqual({
      type: 'Forbidden',
    });
  });
});
