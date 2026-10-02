import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { ClientFavoriteErasure } from '../ports/client-favorite-erasure';

import { RemoveErasedClientFavorites } from './remove-erased-client-favorites';

const CLIENT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR = Actor.system('scheduler', ['identity:erase-client-data']);

class RecordingErasure implements ClientFavoriteErasure {
  readonly calls: (readonly string[])[] = [];

  removeClients(clientIds: readonly string[]) {
    this.calls.push(clientIds);
    return Promise.resolve(1);
  }
}

describe('RemoveErasedClientFavorites', () => {
  it('removes the erased clients from everyone favorites', async () => {
    const favorites = new RecordingErasure();
    const useCase = new RemoveErasedClientFavorites({ favorites });

    expect(unwrap(await useCase.execute({ clientIds: [CLIENT_ID] }, ACTOR))).toEqual({
      removed: 1,
    });
    expect(favorites.calls).toEqual([[CLIENT_ID]]);
  });

  it('rejects invalid ids and actors without the permission', async () => {
    const favorites = new RecordingErasure();
    const useCase = new RemoveErasedClientFavorites({ favorites });

    expect(unwrapErr(await useCase.execute({ clientIds: ['x'] }, ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientIds: [CLIENT_ID] },
          Actor.system('scheduler', ['users:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(favorites.calls).toEqual([]);
  });
});
