import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { ActivityEntity } from '../../contracts';
import { InMemoryActorActivityQuery } from '../../testing';
import { ListMyActivity } from './list-my-activity';

const CAMILA = '01900000-0000-7000-8000-0000000000a1';
const PEDRO = '01900000-0000-7000-8000-0000000000a2';
const PROPERTY = '01900000-0000-7000-8000-0000000000b1';
const CLIENT = '01900000-0000-7000-8000-0000000000c1';

const propertyEntity: ActivityEntity = {
  code: 'P-001',
  name: 'Miralla 745',
  clientId: undefined,
  deleted: false,
};
const clientEntity: ActivityEntity = {
  code: undefined,
  name: 'Ana',
  clientId: undefined,
  deleted: false,
};

let sequence = 0;
function entry(
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  at: string,
  entity?: ActivityEntity,
) {
  sequence += 1;
  return {
    id: `entry-${String(sequence)}`,
    actorId,
    occurredAt: new Date(at),
    action,
    entityType,
    entityId,
    entity,
    changes: { price: { before: 1, after: 2 } },
  };
}

function setup() {
  const activity = new InMemoryActorActivityQuery([
    entry(CAMILA, 'property', PROPERTY, 'property.updated', '2026-10-30T15:00:00Z', propertyEntity),
    entry(CAMILA, 'client', CLIENT, 'client.created', '2026-10-29T15:00:00Z', clientEntity),
    entry(CAMILA, 'user', CAMILA, 'user.signed-in', '2026-10-28T15:00:00Z'),
    entry(CAMILA, 'branch', 'branch-1', 'branch.updated', '2026-10-27T15:00:00Z'),
    entry(PEDRO, 'property', PROPERTY, 'property.deleted', '2026-10-30T16:00:00Z'),
  ]);
  return { activity, list: new ListMyActivity({ activity }) };
}

const camila = Actor.user(CAMILA, ['properties:read', 'clients:read']);

describe('ListMyActivity', () => {
  it('lists only what the viewer did, newest first, with the area of each entry', async () => {
    const { list } = setup();

    const page = unwrap(await list.execute({}, camila));

    expect(page.total).toBe(4);
    expect(page.items.map((item) => [item.action, item.area])).toEqual([
      ['property.updated', 'properties'],
      ['client.created', 'clients'],
      ['user.signed-in', 'users'],
      ['branch.updated', 'other'],
    ]);
    expect(page.items[0]?.entity).toEqual(propertyEntity);
  });

  it('needs no permission: any user sees their own account history', async () => {
    const { list, activity } = setup();

    const page = unwrap(await list.execute({ area: 'users' }, Actor.user(CAMILA, [])));

    expect(page.items.map((item) => item.action)).toEqual(['user.signed-in']);
    expect(activity.criteria[0]?.actorId).toBe(CAMILA);
  });

  it('filters by area and by Buenos Aires days', async () => {
    const { list, activity } = setup();

    const byArea = unwrap(await list.execute({ area: 'other' }, camila));
    expect(byArea.items.map((item) => item.entityType)).toEqual(['branch']);

    const byDay = unwrap(await list.execute({ from: '2026-10-29', to: '2026-10-29' }, camila));
    expect(byDay.items.map((item) => item.action)).toEqual(['client.created']);
    expect(activity.criteria.at(-1)).toMatchObject({
      from: new Date('2026-10-29T03:00:00.000Z'),
      to: new Date('2026-10-30T03:00:00.000Z'),
    });
  });

  it('paginates in the query', async () => {
    const { list, activity } = setup();

    const page = unwrap(await list.execute({ page: 2, pageSize: 3 }, camila));

    expect(page.items.map((item) => item.action)).toEqual(['branch.updated']);
    expect(activity.criteria[0]).toMatchObject({ offset: 3, limit: 3 });
  });

  it('hides the entity and its changes when the viewer can no longer read that area', async () => {
    const { list } = setup();

    const page = unwrap(await list.execute({}, Actor.user(CAMILA, ['properties:read'])));

    const client = page.items.find((item) => item.entityType === 'client');
    expect(client?.entity).toBeUndefined();
    expect(client?.changes).toEqual({});
    expect(page.items[0]?.entity).toEqual(propertyEntity);
  });

  it('forbids system actors', async () => {
    const { list } = setup();

    const error = unwrapErr(await list.execute({}, Actor.system('scheduler', ['audit:read'])));

    expect(error).toEqual({ type: 'Forbidden' });
  });

  it('rejects an invalid query', async () => {
    const { list } = setup();

    // @ts-expect-error: un área que no existe, como la que podría llegar en la URL.
    const error = unwrapErr(await list.execute({ area: 'cash' }, camila));

    expect(error.type).toBe('InvalidInput');
  });
});
