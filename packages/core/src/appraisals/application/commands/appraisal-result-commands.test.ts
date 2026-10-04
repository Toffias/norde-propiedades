import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../../shared';
import { InMemoryFileStorage } from '../../../settings/testing';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import { appraisalPhotoKey } from '../../domain/appraisal-photo';
import type { AppraisalResult } from '../../domain/appraisal-result';
import {
  APPRAISAL_ID,
  APPRAISER_ID,
  appraisalSnapshot,
  BRANCH_ID,
  InMemoryAppraisalsUnitOfWork,
  PRODUCER_ID,
  REQUESTER_ID,
  TEST_APPRAISER,
  TEST_NOW,
  TEST_OTHER_AGENT,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import { GetAppraisalPhotoFile } from '../queries/get-appraisal-photo-file';
import { ConvertAppraisalToListing } from './convert-appraisal-to-listing';
import { DeleteAppraisalPhoto } from './delete-appraisal-photo';
import { RecordAppraisalResult } from './record-appraisal-result';
import { UploadAppraisalPhoto } from './upload-appraisal-photo';

const FIRST_ID = '00000000-0000-7000-8000-000000000001';
const SECOND_ID = '00000000-0000-7000-8000-000000000002';

const SALE_RESULT: AppraisalResult = {
  sale: { minCents: 11_000_000n, maxCents: 12_000_000n, currency: 'USD' },
  rent: undefined,
  comparables: [],
  observations: undefined,
};

/** Un productor que además puede dar de alta propiedades: puede convertir. */
const CONVERTER = Actor.user(PRODUCER_ID, [
  'appraisals:read',
  'appraisals:update',
  'properties:create',
]).withBranch(BRANCH_ID);

function withAppraisal(overrides: Parameters<typeof appraisalSnapshot>[0] = {}) {
  const uow = new InMemoryAppraisalsUnitOfWork();
  const snapshot = appraisalSnapshot(overrides);
  uow.appraisals.rows.set(snapshot.id, snapshot);
  const stored = () => uow.appraisals.rows.get(APPRAISAL_ID);
  return { uow, clock: new FixedClock(TEST_NOW), stored };
}

const RESULT_INPUT = {
  appraisalId: APPRAISAL_ID,
  saleMin: '110000',
  saleMax: '120000,50',
  saleCurrency: 'USD' as const,
  rentMin: '',
  rentMax: '',
  rentCurrency: 'ARS' as const,
  comparables: [
    {
      address: 'Mitre 1500',
      price: '118000',
      currency: 'USD' as const,
      surfaceM2: '65',
      url: 'https://www.zonaprop.com.ar/propiedades/123',
    },
  ],
  observations: 'Muy luminoso.',
};

describe('RecordAppraisalResult', () => {
  it('records the result and only the fields that changed', async () => {
    const { uow, clock, stored } = withAppraisal();
    const record = new RecordAppraisalResult({ uow, clock });

    unwrap(await record.execute(RESULT_INPUT, TEST_PRODUCER));

    expect(stored()?.result).toEqual({
      sale: { minCents: 11_000_000n, maxCents: 12_000_050n, currency: 'USD' },
      rent: undefined,
      comparables: [
        {
          address: 'Mitre 1500',
          priceCents: 11_800_000n,
          currency: 'USD',
          surfaceM2: 65,
          url: 'https://www.zonaprop.com.ar/propiedades/123',
          note: undefined,
        },
      ],
      observations: 'Muy luminoso.',
    });
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'appraisals.appraisal_result_recorded',
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'updated',
        action: 'appraisal.result_recorded',
        entityId: APPRAISAL_ID,
        clientIds: [REQUESTER_ID],
        changes: {
          saleMinCents: { before: null, after: 11_000_000n },
          saleMaxCents: { before: null, after: 12_000_050n },
          saleCurrency: { before: null, after: 'USD' },
          comparables: {
            before: null,
            after: [
              {
                address: 'Mitre 1500',
                priceCents: 11_800_000n,
                currency: 'USD',
                surfaceM2: 65,
                url: 'https://www.zonaprop.com.ar/propiedades/123',
              },
            ],
          },
          observations: { before: null, after: 'Muy luminoso.' },
        },
      }),
    ]);

    unwrap(await record.execute({ ...RESULT_INPUT, observations: 'Luminoso.' }, TEST_PRODUCER));
    expect(uow.audit.entries.at(-1)?.changes).toEqual({
      observations: { before: 'Muy luminoso.', after: 'Luminoso.' },
    });
  });

  it('records nothing when nothing changed', async () => {
    const { uow, clock } = withAppraisal();
    const record = new RecordAppraisalResult({ uow, clock });
    unwrap(await record.execute(RESULT_INPUT, TEST_PRODUCER));
    unwrap(await record.execute(RESULT_INPUT, TEST_PRODUCER));
    expect(uow.audit.entries).toHaveLength(1);
  });

  it('asks for both values of an operation, the minimum not above the maximum', async () => {
    const { uow, clock } = withAppraisal();
    const record = new RecordAppraisalResult({ uow, clock });
    const half = unwrapErr(await record.execute({ ...RESULT_INPUT, saleMax: '' }, TEST_PRODUCER));
    expect(half).toEqual({ type: 'InvalidInput', issues: ['Cargá el mínimo y el máximo.'] });
    const inverted = unwrapErr(
      await record.execute({ ...RESULT_INPUT, saleMin: '130000' }, TEST_PRODUCER),
    );
    expect(inverted).toEqual({
      type: 'InvalidInput',
      issues: ['El mínimo no puede superar al máximo.'],
    });
  });

  it('keeps a value while the appraisal is appraised', async () => {
    const { uow, clock } = withAppraisal({ status: 'appraised', result: SALE_RESULT });
    const record = new RecordAppraisalResult({ uow, clock });
    expect(
      unwrapErr(await record.execute({ ...RESULT_INPUT, saleMin: '', saleMax: '' }, TEST_PRODUCER)),
    ).toEqual({ type: 'AppraisalValueRequired' });
  });

  it('rejects a converted appraisal', async () => {
    const { uow, clock } = withAppraisal({ status: 'converted' });
    const record = new RecordAppraisalResult({ uow, clock });
    expect(unwrapErr(await record.execute(RESULT_INPUT, TEST_PRODUCER))).toEqual({
      type: 'AppraisalConverted',
    });
  });

  it('lets the appraiser record it and hides it from other agents', async () => {
    const { uow, clock, stored } = withAppraisal({ appraiserUserId: APPRAISER_ID });
    const record = new RecordAppraisalResult({ uow, clock });
    unwrap(await record.execute(RESULT_INPUT, TEST_APPRAISER));
    expect(stored()?.result.sale).toBeDefined();
    expect(unwrapErr(await record.execute(RESULT_INPUT, TEST_OTHER_AGENT))).toEqual({
      type: 'AppraisalNotFound',
    });
    expect(unwrapErr(await record.execute(RESULT_INPUT, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

const JPEG = { contentType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) };

function photoSetup(overrides: Parameters<typeof appraisalSnapshot>[0] = {}) {
  const context = withAppraisal(overrides);
  const storage = new InMemoryFileStorage();
  const ids = new SequentialIdGenerator();
  const upload = new UploadAppraisalPhoto({ ...context, storage, ids });
  const remove = new DeleteAppraisalPhoto(context);
  const file = new GetAppraisalPhotoFile({ uow: context.uow, storage });
  return { ...context, storage, upload, remove, file };
}

describe('UploadAppraisalPhoto', () => {
  it('stores the original and records it in the history', async () => {
    const { uow, storage, upload } = photoSetup();

    expect(
      unwrap(await upload.execute({ appraisalId: APPRAISAL_ID, ...JPEG }, TEST_PRODUCER)),
    ).toEqual({ photoId: FIRST_ID });
    unwrap(await upload.execute({ appraisalId: APPRAISAL_ID, ...JPEG }, TEST_PRODUCER));

    const key = appraisalPhotoKey(APPRAISAL_ID, FIRST_ID);
    expect(storage.objects.get(key)?.contentType).toBe('image/jpeg');
    expect([...uow.photos.rows.values()].map((photo) => [photo.id, photo.position])).toEqual([
      [FIRST_ID, 0],
      [SECOND_ID, 1],
    ]);
    expect(uow.audit.entries[0]).toEqual(
      expect.objectContaining({
        kind: 'action',
        action: 'appraisal.photo_added',
        entityId: APPRAISAL_ID,
        clientIds: [REQUESTER_ID],
        changes: { [`photos.${FIRST_ID}`]: { before: null, after: key } },
      }),
    );
  });

  it('rejects files that are not images and uploads nothing', async () => {
    const { storage, upload } = photoSetup();
    const pdf = { appraisalId: APPRAISAL_ID, contentType: 'application/pdf', bytes: JPEG.bytes };
    expect(unwrapErr(await upload.execute(pdf, TEST_PRODUCER))).toEqual({
      type: 'UnsupportedPhotoType',
    });
    expect(storage.objects.size).toBe(0);
  });

  it('rejects a converted appraisal or one the user cannot see', async () => {
    const converted = photoSetup({ status: 'converted' });
    expect(
      unwrapErr(
        await converted.upload.execute({ appraisalId: APPRAISAL_ID, ...JPEG }, TEST_PRODUCER),
      ),
    ).toEqual({ type: 'AppraisalConverted' });
    expect(converted.storage.objects.size).toBe(0);

    const hidden = photoSetup();
    expect(
      unwrapErr(
        await hidden.upload.execute({ appraisalId: APPRAISAL_ID, ...JPEG }, TEST_OTHER_AGENT),
      ),
    ).toEqual({ type: 'AppraisalNotFound' });
  });
});

describe('DeleteAppraisalPhoto', () => {
  it('removes the photo, asks to delete its file and records it', async () => {
    const { uow, upload, remove } = photoSetup();
    unwrap(await upload.execute({ appraisalId: APPRAISAL_ID, ...JPEG }, TEST_PRODUCER));
    const key = appraisalPhotoKey(APPRAISAL_ID, FIRST_ID);

    unwrap(await remove.execute({ appraisalId: APPRAISAL_ID, photoId: FIRST_ID }, TEST_PRODUCER));

    expect(uow.photos.rows.size).toBe(0);
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'appraisals.appraisal_photo_deleted',
        payload: expect.objectContaining({ storageKeys: [key] }) as unknown,
      }),
    ]);
    expect(uow.audit.entries.at(-1)).toEqual(
      expect.objectContaining({
        action: 'appraisal.photo_deleted',
        changes: { [`photos.${FIRST_ID}`]: { before: key, after: null } },
      }),
    );
  });

  it('only removes a photo of that appraisal', async () => {
    const { remove } = photoSetup();
    expect(
      unwrapErr(
        await remove.execute({ appraisalId: APPRAISAL_ID, photoId: FIRST_ID }, TEST_PRODUCER),
      ),
    ).toEqual({ type: 'AppraisalPhotoNotFound' });
  });
});

describe('GetAppraisalPhotoFile', () => {
  it('serves the photo to who can see the appraisal', async () => {
    const { upload, file, storage } = photoSetup();
    unwrap(await upload.execute({ appraisalId: APPRAISAL_ID, ...JPEG }, TEST_PRODUCER));
    const input = { appraisalId: APPRAISAL_ID, photoId: FIRST_ID };

    expect(unwrap(await file.execute(input, TEST_PRODUCER))).toEqual({
      kind: 'content',
      fileName: `${FIRST_ID}.jpeg`,
      contentType: 'image/jpeg',
      bytes: JPEG.bytes,
    });
    storage.signing = true;
    expect(unwrap(await file.execute(input, TEST_PRODUCER))).toEqual({
      kind: 'redirect',
      url: `signed:${appraisalPhotoKey(APPRAISAL_ID, FIRST_ID)}`,
    });
    expect(unwrapErr(await file.execute(input, TEST_OTHER_AGENT))).toEqual({
      type: 'AppraisalNotFound',
    });
  });
});

describe('ConvertAppraisalToListing', () => {
  function convertSetup(overrides: Parameters<typeof appraisalSnapshot>[0] = {}) {
    const context = withAppraisal({ status: 'appraised', result: SALE_RESULT, ...overrides });
    const convert = new ConvertAppraisalToListing({
      ...context,
      ids: new SequentialIdGenerator(),
    });
    return { ...context, convert };
  }

  it('marks it converted, sends the draft data with the photos and records it', async () => {
    const { uow, convert, stored } = convertSetup();
    const photoKey = appraisalPhotoKey(APPRAISAL_ID, SECOND_ID);
    await uow.photos.insert({
      id: unwrap(parseId<'AppraisalPhoto'>(SECOND_ID)),
      appraisalId: unwrap(parseId<'Appraisal'>(APPRAISAL_ID)),
      storageKey: photoKey,
      position: 0,
      createdAt: TEST_NOW,
    });

    expect(unwrap(await convert.execute({ appraisalId: APPRAISAL_ID }, CONVERTER))).toEqual({
      propertyId: FIRST_ID,
    });

    expect(stored()).toMatchObject({ status: 'converted', convertedPropertyId: FIRST_ID });
    expect(uow.events.published).toEqual([
      expect.objectContaining({
        type: 'appraisals.appraisal_converted',
        payload: expect.objectContaining({
          listing: expect.objectContaining({
            propertyId: FIRST_ID,
            sale: { priceCents: '12000000', currency: 'USD' },
            photoKeys: [photoKey],
          }) as unknown,
        }) as unknown,
      }),
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'appraisal.converted',
        clientIds: [REQUESTER_ID],
        changes: {
          status: { before: 'appraised', after: 'converted' },
          convertedPropertyId: { before: null, after: FIRST_ID },
        },
      }),
    ]);
  });

  it('rejects converting it twice', async () => {
    const { uow, convert } = convertSetup();
    unwrap(await convert.execute({ appraisalId: APPRAISAL_ID }, CONVERTER));
    expect(unwrapErr(await convert.execute({ appraisalId: APPRAISAL_ID }, CONVERTER))).toEqual({
      type: 'AppraisalConverted',
    });
    expect(uow.events.published).toHaveLength(1);
    expect(uow.audit.entries).toHaveLength(1);
  });

  it('only converts an appraised appraisal', async () => {
    const { uow, convert } = convertSetup({ status: 'requested' });
    expect(unwrapErr(await convert.execute({ appraisalId: APPRAISAL_ID }, CONVERTER))).toEqual({
      type: 'AppraisalNotAppraised',
    });
    expect(uow.events.published).toEqual([]);
  });

  it('needs appraisals:update and properties:create over a visible appraisal', async () => {
    const { convert } = convertSetup();
    const input = { appraisalId: APPRAISAL_ID };
    expect(unwrapErr(await convert.execute(input, TEST_PRODUCER))).toEqual({ type: 'Forbidden' });
    const stranger = Actor.user('00000000-0000-7000-8000-0000000000a7', [
      'appraisals:read',
      'appraisals:update',
      'properties:create',
    ]);
    expect(unwrapErr(await convert.execute(input, stranger))).toEqual({
      type: 'AppraisalNotFound',
    });
  });
});
