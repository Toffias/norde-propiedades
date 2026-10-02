import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { PropertyClientErasure } from '../ports/property-client-erasure';

import { UnlinkErasedClients } from './unlink-erased-clients';

const CLIENT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR = Actor.system('scheduler', ['properties:erase-client-data']);

class RecordingErasure implements PropertyClientErasure {
  readonly calls: (readonly string[])[] = [];

  unlinkClients(clientIds: readonly string[]) {
    this.calls.push(clientIds);
    return Promise.resolve(3);
  }
}

describe('UnlinkErasedClients', () => {
  it('unlinks the erased clients from the properties', async () => {
    const erasure = new RecordingErasure();
    const useCase = new UnlinkErasedClients({ erasure });

    expect(unwrap(await useCase.execute({ clientIds: [CLIENT_ID] }, ACTOR))).toEqual({
      unlinked: 3,
    });
    expect(erasure.calls).toEqual([[CLIENT_ID]]);
  });

  it('rejects invalid ids and actors without the permission', async () => {
    const erasure = new RecordingErasure();
    const useCase = new UnlinkErasedClients({ erasure });

    expect(unwrapErr(await useCase.execute({ clientIds: ['x'] }, ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientIds: [CLIENT_ID] },
          Actor.system('scheduler', ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(erasure.calls).toEqual([]);
  });
});
