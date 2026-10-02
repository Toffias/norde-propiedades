import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import type { ClientConversationErasure } from '../ports/client-conversation-erasure';

import { EraseClientConversations } from './erase-client-conversations';

const CLIENT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR = Actor.system('scheduler', ['conversations:erase-client-data']);

class RecordingErasure implements ClientConversationErasure {
  readonly calls: (readonly string[])[] = [];

  eraseForClients(clientIds: readonly string[]) {
    this.calls.push(clientIds);
    return Promise.resolve(2);
  }
}

describe('EraseClientConversations', () => {
  it('erases the conversations of the erased clients', async () => {
    const erasure = new RecordingErasure();
    const useCase = new EraseClientConversations({ erasure });

    expect(unwrap(await useCase.execute({ clientIds: [CLIENT_ID] }, ACTOR))).toEqual({
      erased: 2,
    });
    expect(erasure.calls).toEqual([[CLIENT_ID]]);
  });

  it('rejects invalid ids and actors without the permission', async () => {
    const erasure = new RecordingErasure();
    const useCase = new EraseClientConversations({ erasure });

    expect(unwrapErr(await useCase.execute({ clientIds: ['x'] }, ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(unwrapErr(await useCase.execute({ clientIds: [] }, ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientIds: [CLIENT_ID] },
          Actor.system('scheduler', ['conversations:receive']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(erasure.calls).toEqual([]);
  });
});
