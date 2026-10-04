import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { InMemoryFileStorage } from '../../../settings/testing';
import { unwrap, unwrapErr } from '../../../shared/testing';
import { appraisalPhotoKey } from '../../domain/appraisal-photo';
import {
  APPRAISAL_ID,
  appraisalSnapshot,
  InMemoryAppraisalsUnitOfWork,
  OTHER_CLIENT_ID,
  REQUESTER_ID,
  TEST_PRODUCER,
} from '../../testing';
import { DeleteAppraisalPhotoFiles } from './delete-appraisal-photo-files';
import { EraseClientAppraisals } from './erase-client-appraisals';
import { MoveMergedClientAppraisals } from './move-merged-client-appraisals';

const SCHEDULER = Actor.system('scheduler', [
  'appraisals:erase-client-data',
  'appraisals:merge-client-data',
  'appraisals:process-photos',
]);
const PHOTO_ID = '00000000-0000-7000-8000-0000000000f1';
const PHOTO_KEY = appraisalPhotoKey(APPRAISAL_ID, PHOTO_ID);

function id<T extends string>(raw: string) {
  return unwrap(parseId<T>(raw));
}

/** La primera tasación tiene una foto, también en el storage. */
async function withPhoto(uow: InMemoryAppraisalsUnitOfWork) {
  const storage = new InMemoryFileStorage();
  await storage.put({ key: PHOTO_KEY, contentType: 'image/jpeg', bytes: new Uint8Array([1]) });
  await uow.photos.insert({
    id: id<'AppraisalPhoto'>(PHOTO_ID),
    appraisalId: id<'Appraisal'>(APPRAISAL_ID),
    storageKey: PHOTO_KEY,
    position: 0,
    createdAt: new Date('2026-10-01T12:00:00Z'),
  });
  return storage;
}
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
  it('deletes the appraisals the erased clients requested, with their photos', async () => {
    const uow = setup();
    const storage = await withPhoto(uow);
    const erase = new EraseClientAppraisals({ uow, storage });

    expect(unwrap(await erase.execute({ clientIds: [REQUESTER_ID] }, SCHEDULER))).toEqual({
      erased: 1,
    });
    expect([...uow.appraisals.rows.keys()]).toEqual([SECOND_ID]);
    expect(uow.photos.rows.size).toBe(0);
    expect(storage.objects.has(PHOTO_KEY)).toBe(false);
    expect(unwrap(await erase.execute({ clientIds: [REQUESTER_ID] }, SCHEDULER))).toEqual({
      erased: 0,
    });
  });

  it('erases in batches until none is left', async () => {
    const uow = new InMemoryAppraisalsUnitOfWork();
    for (let n = 0; n < 120; n += 1) {
      const snapshot = appraisalSnapshot({
        id: `00000000-0000-7000-8000-${n.toString().padStart(12, '0')}`,
      });
      uow.appraisals.rows.set(snapshot.id, snapshot);
    }
    const erase = new EraseClientAppraisals({ uow, storage: new InMemoryFileStorage() });

    expect(unwrap(await erase.execute({ clientIds: [REQUESTER_ID] }, SCHEDULER))).toEqual({
      erased: 120,
    });
    expect(uow.appraisals.rows.size).toBe(0);
  });

  it('keeps the rows when a file cannot be deleted, so the retry finds them', async () => {
    const uow = setup();
    const storage = await withPhoto(uow);
    storage.delete = () => Promise.reject(new Error('storage down'));
    const erase = new EraseClientAppraisals({ uow, storage });

    await expect(erase.execute({ clientIds: [REQUESTER_ID] }, SCHEDULER)).rejects.toThrow();
    expect(uow.appraisals.rows.has(APPRAISAL_ID)).toBe(true);
    expect(uow.photos.rows.has(PHOTO_ID)).toBe(true);
  });

  it('needs appraisals:erase-client-data and a valid input', async () => {
    const erase = new EraseClientAppraisals({ uow: setup(), storage: new InMemoryFileStorage() });
    expect(unwrapErr(await erase.execute({ clientIds: [REQUESTER_ID] }, TEST_PRODUCER))).toEqual({
      type: 'Forbidden',
    });
    expect(unwrapErr(await erase.execute({ clientIds: [] }, SCHEDULER))).toEqual({
      type: 'InvalidInput',
    });
  });
});

describe('DeleteAppraisalPhotoFiles', () => {
  it('deletes the files of the removed photos', async () => {
    const storage = await withPhoto(setup());
    const job = new DeleteAppraisalPhotoFiles({ storage });

    unwrap(await job.execute({ storageKeys: [PHOTO_KEY] }, SCHEDULER));
    expect(storage.objects.size).toBe(0);
  });

  it('only deletes appraisal photos and needs appraisals:process-photos', async () => {
    const job = new DeleteAppraisalPhotoFiles({ storage: new InMemoryFileStorage() });
    const otherKey = `properties/${APPRAISAL_ID}/media/${PHOTO_ID}/original`;

    expect(unwrapErr(await job.execute({ storageKeys: [otherKey] }, SCHEDULER)).type).toBe(
      'InvalidInput',
    );
    expect(unwrapErr(await job.execute({ storageKeys: [PHOTO_KEY] }, TEST_PRODUCER))).toEqual({
      type: 'Forbidden',
    });
  });
});
