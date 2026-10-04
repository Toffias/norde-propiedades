import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryIdentityUnitOfWork } from '../../testing';

import { MoveMergedClientFavorites } from './move-merged-client-favorites';

const ACTOR = Actor.system('scheduler', ['identity:merge-client-data']);
const PRIMARY = '00000000-0000-7000-8000-0000000000d1';
const DUPLICATE = '00000000-0000-7000-8000-0000000000d2';
const ANA = '00000000-0000-7000-8000-0000000000a1';
const BETO = '00000000-0000-7000-8000-0000000000a2';

describe('MoveMergedClientFavorites', () => {
  it('moves the favorite to the primary, keeping one for users who had both', async () => {
    const uow = new InMemoryIdentityUnitOfWork();
    await uow.favorites.add(ANA, 'client', [DUPLICATE]);
    await uow.favorites.add(BETO, 'client', [DUPLICATE, PRIMARY]);
    await uow.favorites.add(BETO, 'property', [DUPLICATE]);

    const result = unwrap(
      await new MoveMergedClientFavorites({ uow }).execute(
        { clientId: PRIMARY, mergedClientId: DUPLICATE },
        ACTOR,
      ),
    );

    expect(result).toEqual({ moved: 2 });
    expect([...uow.favorites.rows].sort()).toEqual(
      [
        `${ANA}|client|${PRIMARY}`,
        `${BETO}|client|${PRIMARY}`,
        `${BETO}|property|${DUPLICATE}`,
      ].sort(),
    );
    expect(uow.audit.entries.map((entry) => [entry.action, entry.entityId])).toEqual([
      ['user.favorites_merged', ANA],
      ['user.favorites_merged', BETO],
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      clientIds: [PRIMARY, DUPLICATE],
      changes: { clientId: { before: DUPLICATE, after: PRIMARY } },
    });
  });

  it('rejects an invalid input and actors without the permission', async () => {
    const useCase = new MoveMergedClientFavorites({ uow: new InMemoryIdentityUnitOfWork() });
    expect(
      unwrapErr(await useCase.execute({ clientId: PRIMARY, mergedClientId: PRIMARY }, ACTOR)),
    ).toEqual({ type: 'InvalidInput' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: PRIMARY, mergedClientId: DUPLICATE },
          Actor.system('scheduler', ['identity:erase-client-data']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});
