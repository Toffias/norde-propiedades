import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryIdentityUnitOfWork } from '../../testing';
import { GetFavoriteIds } from '../queries/get-favorite-ids';
import { AddFavorites, RemoveFavorites } from './change-favorites';

const USER = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const A = '00000000-0000-7000-8000-0000000000c1';
const B = '00000000-0000-7000-8000-0000000000c2';
const ACTOR = Actor.user(USER, ['properties:read']);

function setup() {
  const uow = new InMemoryIdentityUnitOfWork();
  return {
    uow,
    add: new AddFavorites({ uow, clock: new FixedClock() }),
    remove: new RemoveFavorites({ uow }),
    ids: new GetFavoriteIds({ favorites: uow.favorites }),
  };
}

describe('favorites', () => {
  it('adds only the new favorites and audits them against the user', async () => {
    const { uow, add } = setup();
    expect(unwrap(await add.execute({ entityType: 'property', ids: [A] }, ACTOR))).toEqual({
      changed: 1,
    });
    expect(unwrap(await add.execute({ entityType: 'property', ids: [A, B] }, ACTOR))).toEqual({
      changed: 1,
    });
    expect(uow.audit.entries).toHaveLength(2);
    expect(uow.audit.entries[1]).toMatchObject({
      kind: 'action',
      action: 'user.favorites_added',
      entityType: 'user',
      entityId: USER,
      changes: { ids: { before: null, after: [B] } },
    });
  });

  it('keeps each user favorites apart and removes them', async () => {
    const { uow, add, remove, ids } = setup();
    unwrap(await add.execute({ entityType: 'property', ids: [A, B] }, ACTOR));
    unwrap(await add.execute({ entityType: 'property', ids: [A] }, Actor.user(OTHER, [])));

    expect([
      ...unwrap(await ids.execute({ entityType: 'property', ids: [A, B] }, Actor.user(OTHER, []))),
    ]).toEqual([A]);

    expect(unwrap(await remove.execute({ entityType: 'property', ids: [A] }, ACTOR))).toEqual({
      changed: 1,
    });
    expect([...unwrap(await ids.execute({ entityType: 'property', ids: [A, B] }, ACTOR))]).toEqual([
      B,
    ]);
    expect(unwrap(await remove.execute({ entityType: 'property', ids: [A] }, ACTOR))).toEqual({
      changed: 0,
    });
    expect(uow.audit.entries.at(-1)?.action).toBe('user.favorites_removed');
  });

  it('is only for users and validates the input', async () => {
    const { add } = setup();
    expect(
      unwrapErr(
        await add.execute({ entityType: 'property', ids: [A] }, Actor.system('import', [])),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await add.execute({ entityType: 'property', ids: [] }, ACTOR)).type).toBe(
      'InvalidInput',
    );
  });
});
