import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryConversationsUnitOfWork } from '../../testing';

import { MoveMergedClientConversations } from './move-merged-client-conversations';

const ACTOR = Actor.system('scheduler', ['conversations:merge-client-data']);
const PRIMARY = '00000000-0000-7000-8000-0000000000d1';
const DUPLICATE = '00000000-0000-7000-8000-0000000000d2';
const CONVERSATION = '00000000-0000-7000-8000-0000000000e9';

describe('MoveMergedClientConversations', () => {
  it('moves the conversations of the duplicate and records it in each history', async () => {
    const uow = new InMemoryConversationsUnitOfWork();
    uow.clientMerge.moved = [CONVERSATION];

    const result = unwrap(
      await new MoveMergedClientConversations({ uow }).execute(
        { clientId: PRIMARY, mergedClientId: DUPLICATE },
        ACTOR,
      ),
    );

    expect(result).toEqual({ moved: 1 });
    expect(uow.clientMerge.moves).toEqual([{ from: DUPLICATE, to: PRIMARY }]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'conversation.client_merged',
        entityType: 'conversation',
        entityId: CONVERSATION,
        clientIds: [PRIMARY, DUPLICATE],
        changes: { clientId: { before: DUPLICATE, after: PRIMARY } },
      }),
    ]);
  });

  it('rejects an invalid input and actors without the permission', async () => {
    const uow = new InMemoryConversationsUnitOfWork();
    const useCase = new MoveMergedClientConversations({ uow });
    expect(
      unwrapErr(await useCase.execute({ clientId: PRIMARY, mergedClientId: 'nope' }, ACTOR)),
    ).toEqual({ type: 'InvalidInput' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: PRIMARY, mergedClientId: DUPLICATE },
          Actor.system('scheduler', ['conversations:erase-client-data']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(uow.clientMerge.moves).toEqual([]);
  });
});
