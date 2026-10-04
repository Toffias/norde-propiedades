import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  APPRAISAL_ID,
  appraisalSnapshot,
  InMemoryAppraisalsUnitOfWork,
  OTHER_CLIENT_ID,
  REQUESTER_ID,
  TEST_PRODUCER,
} from '../../testing';
import { EraseClientAppraisals } from './erase-client-appraisals';
import { MoveMergedClientAppraisals } from './move-merged-client-appraisals';

const SCHEDULER = Actor.system('scheduler', [
  'appraisals:erase-client-data',
  'appraisals:merge-client-data',
]);
const SECOND_ID = '00000000-0000-7000-8000-0000000000d2';
const THIRD_CLIENT = '00000000-0000-7000-8000-0000000000c3';

function setup() {
  const uow = new InMemoryAppraisalsUnitOfWork();
  for (const snapshot of [
    appraisalSnapshot(),
    appraisalSnapshot({ id: SECOND_ID, requesterClientId: THIRD_CLIENT }),
  ]) {
    uow.appraisals.rows.set(snapshot.id, snapshot);
  }
  return uow;
}

describe('MoveMergedClientAppraisals', () => {
  it('moves the appraisals of the duplicate and records it in each history', async () => {
    const uow = setup();
    const move = new MoveMergedClientAppraisals({ uow });

    const result = unwrap(
      await move.execute({ clientId: OTHER_CLIENT_ID, mergedClientId: REQUESTER_ID }, SCHEDULER),
    );

    expect(result).toEqual({ moved: 1 });
    expect(uow.appraisals.rows.get(APPRAISAL_ID)?.requesterClientId).toBe(OTHER_CLIENT_ID);
    expect(uow.appraisals.rows.get(SECOND_ID)?.requesterClientId).toBe(THIRD_CLIENT);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'appraisal.client_merged',
        entityType: 'appraisal',
        entityId: APPRAISAL_ID,
        clientIds: [OTHER_CLIENT_ID, REQUESTER_ID],
        changes: { requesterClientId: { before: REQUESTER_ID, after: OTHER_CLIENT_ID } },
      }),
    ]);

    const again = unwrap(
      await move.execute({ clientId: OTHER_CLIENT_ID, mergedClientId: REQUESTER_ID }, SCHEDULER),
    );
    expect(again).toEqual({ moved: 0 });
  });

  it('needs appraisals:merge-client-data and a valid input', async () => {
    const move = new MoveMergedClientAppraisals({ uow: setup() });
    const input = { clientId: OTHER_CLIENT_ID, mergedClientId: REQUESTER_ID };
    expect(unwrapErr(await move.execute(input, TEST_PRODUCER))).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await move.execute({ clientId: REQUESTER_ID, mergedClientId: REQUESTER_ID }, SCHEDULER),
      ),
    ).toEqual({ type: 'InvalidInput' });
  });
});

describe('EraseClientAppraisals', () => {
  it('deletes the appraisals the erased clients requested', async () => {
    const uow = setup();
    const erase = new EraseClientAppraisals({ uow });

    expect(unwrap(await erase.execute({ clientIds: [REQUESTER_ID] }, SCHEDULER))).toEqual({
      erased: 1,
    });
    expect([...uow.appraisals.rows.keys()]).toEqual([SECOND_ID]);
    expect(unwrap(await erase.execute({ clientIds: [REQUESTER_ID] }, SCHEDULER))).toEqual({
      erased: 0,
    });
  });

  it('needs appraisals:erase-client-data and a valid input', async () => {
    const erase = new EraseClientAppraisals({ uow: setup() });
    expect(unwrapErr(await erase.execute({ clientIds: [REQUESTER_ID] }, TEST_PRODUCER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await erase.execute({ clientIds: [] }, SCHEDULER))).toEqual({
      type: 'InvalidInput',
    });
  });
});
