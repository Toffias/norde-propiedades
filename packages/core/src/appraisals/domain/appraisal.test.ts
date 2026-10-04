import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { unwrap, unwrapErr } from '../../shared/testing';
import {
  APPRAISAL_SOURCE_VALUES,
  APPRAISAL_STATUS_GROUP_VALUES,
  APPRAISAL_STATUS_VALUES,
  APPRAISAL_PHOTO_TYPE_VALUES,
  CONDITION_VALUES,
  CURRENCIES,
  MAX_APPRAISAL_COMPARABLES as MAX_COMPARABLES_VALUE,
  MAX_APPRAISAL_PHOTO_BYTES as MAX_PHOTO_BYTES_VALUE,
  MAX_APPRAISAL_PHOTOS as MAX_PHOTOS_VALUE,
  PROPERTY_TYPES,
} from '../contracts';
import { appraisalSnapshot, TEST_NOW } from '../testing';

import { Appraisal, appraisalCode, type AppraisalDetails } from './appraisal';
import {
  APPRAISAL_PHOTO_TYPES,
  checkPhotoRoom,
  MAX_APPRAISAL_PHOTO_BYTES,
  MAX_APPRAISAL_PHOTOS,
  validateAppraisalPhoto,
} from './appraisal-photo';
import {
  APPRAISAL_CURRENCIES,
  comparablePricePerM2Cents,
  EMPTY_APPRAISAL_RESULT,
  MAX_APPRAISAL_COMPARABLES,
  type AppraisalComparable,
  type AppraisalResult,
} from './appraisal-result';
import {
  APPRAISAL_STATUS_GROUPS,
  APPRAISAL_STATUSES,
  canAppraisalTransition,
  statusesOfGroup,
} from './appraisal-status';
import {
  APPRAISAL_CONDITIONS,
  APPRAISAL_PROPERTY_TYPES,
  APPRAISAL_SOURCES,
} from './appraisal-values';

const ID = unwrap(parseId<'Appraisal'>('00000000-0000-7000-8000-0000000000d1'));
const LATER = new Date('2026-10-05T15:00:00.000Z');
const VISIT = new Date('2026-10-10T13:00:00.000Z');

const DETAILS: AppraisalDetails = {
  requesterClientId: '00000000-0000-7000-8000-0000000000c1',
  producerUserId: '00000000-0000-7000-8000-0000000000a1',
  branchId: '00000000-0000-7000-8000-0000000000b1',
  appraiserUserId: undefined,
  visitAt: undefined,
  propertyType: 'house',
  address: '  Mitre 1234 ',
  surfaceTotalM2: 300,
  surfaceCoveredM2: 180.5,
  rooms: 5,
  bedrooms: 3,
  bathrooms: 2,
  condition: 'good',
};

const COMPARABLE: AppraisalComparable = {
  address: ' Mitre 1500 ',
  priceCents: 11_800_000n,
  currency: 'USD',
  surfaceM2: 65,
  url: ' ',
  note: undefined,
};

const RESULT: AppraisalResult = {
  sale: { minCents: 11_000_000n, maxCents: 12_000_000n, currency: 'USD' },
  rent: undefined,
  comparables: [COMPARABLE],
  observations: '  Muy luminoso. ',
};

const PROPERTY_ID = '00000000-0000-7000-8000-0000000000e1';

function restored(overrides: Parameters<typeof appraisalSnapshot>[0] = {}): Appraisal {
  return Appraisal.restore(appraisalSnapshot(overrides));
}

describe('appraisalCode', () => {
  it('pads the sequence number to four digits', () => {
    expect(appraisalCode(7)).toBe('TAS0007');
    expect(appraisalCode(12345)).toBe('TAS12345');
  });
});

describe('Appraisal.create', () => {
  it('starts requested, trims the address and records the request', () => {
    const appraisal = unwrap(
      Appraisal.create({ ...DETAILS, id: ID, code: 'TAS0001', source: 'manual', now: TEST_NOW }),
    );

    expect(appraisal.toSnapshot()).toMatchObject({
      status: 'requested',
      statusChangedAt: TEST_NOW,
      address: 'Mitre 1234',
      code: 'TAS0001',
      deletedAt: undefined,
    });
    expect(appraisal.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'appraisals.appraisal_requested',
        payload: { appraisalId: ID, requesterClientId: DETAILS.requesterClientId },
      }),
    ]);
  });

  it('rejects negative measures', () => {
    const error = unwrapErr(
      Appraisal.create({
        ...DETAILS,
        rooms: -1,
        id: ID,
        code: 'TAS0001',
        source: 'manual',
        now: TEST_NOW,
      }),
    );
    expect(error).toEqual({ type: 'NegativeAppraisalMeasure' });
  });
});

describe('Appraisal.update', () => {
  it('changes the details and reports the change', () => {
    const appraisal = restored();
    const changed = unwrap(appraisal.update({ ...DETAILS, rooms: 6 }, LATER));

    expect(changed).toBe(true);
    expect(appraisal.toSnapshot()).toMatchObject({ rooms: 6, updatedAt: LATER });
    expect(appraisal.pullEvents().map((e) => e.type)).toEqual(['appraisals.appraisal_updated']);
  });

  it('does nothing when nothing changed', () => {
    const appraisal = restored();
    const current = appraisal.toSnapshot();
    expect(unwrap(appraisal.update(current, LATER))).toBe(false);
    expect(appraisal.pullEvents()).toEqual([]);
  });

  it('compares the visit by its instant', () => {
    const appraisal = restored({ visitAt: VISIT });
    const current = appraisal.toSnapshot();
    expect(unwrap(appraisal.update({ ...current, visitAt: new Date(VISIT) }, LATER))).toBe(false);
  });

  it('keeps the visit date while the visit is scheduled', () => {
    const appraisal = restored({ status: 'visit_scheduled', visitAt: VISIT });
    const error = unwrapErr(appraisal.update({ ...DETAILS, visitAt: undefined }, LATER));
    expect(error).toEqual({ type: 'VisitDateRequired' });
  });

  it('rejects editing a converted or deleted appraisal', () => {
    expect(unwrapErr(restored({ status: 'converted' }).update(DETAILS, LATER))).toEqual({
      type: 'AppraisalConverted',
    });
    expect(unwrapErr(restored({ deletedAt: TEST_NOW }).update(DETAILS, LATER))).toEqual({
      type: 'AppraisalDeleted',
    });
  });
});

describe('Appraisal.changeStatus', () => {
  it('moves to a valid status and records the transition', () => {
    const appraisal = restored({ visitAt: VISIT });
    expect(unwrap(appraisal.changeStatus('visit_scheduled', LATER))).toBe(true);

    expect(appraisal.toSnapshot()).toMatchObject({
      status: 'visit_scheduled',
      statusChangedAt: LATER,
    });
    expect(appraisal.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'appraisals.appraisal_status_changed',
        payload: {
          appraisalId: ID,
          requesterClientId: DETAILS.requesterClientId,
          from: 'requested',
          to: 'visit_scheduled',
        },
      }),
    ]);
  });

  it('does nothing when the status is the same', () => {
    expect(unwrap(restored().changeStatus('requested', LATER))).toBe(false);
  });

  it('needs the visit date to schedule the visit', () => {
    expect(unwrapErr(restored().changeStatus('visit_scheduled', LATER))).toEqual({
      type: 'VisitDateRequired',
    });
  });

  it('rejects an invalid transition', () => {
    expect(unwrapErr(restored({ status: 'discarded' }).changeStatus('appraised', LATER))).toEqual({
      type: 'InvalidAppraisalTransition',
      from: 'discarded',
      to: 'appraised',
    });
  });

  it('reopens a discarded appraisal', () => {
    expect(unwrap(restored({ status: 'discarded' }).changeStatus('requested', LATER))).toBe(true);
  });

  it('rejects changing a converted appraisal', () => {
    expect(unwrapErr(restored({ status: 'converted' }).changeStatus('discarded', LATER))).toEqual({
      type: 'AppraisalConverted',
    });
  });

  it('needs a suggested value to mark it appraised', () => {
    expect(unwrapErr(restored().changeStatus('appraised', LATER))).toEqual({
      type: 'AppraisalValueRequired',
    });
    expect(unwrap(restored({ result: RESULT }).changeStatus('appraised', LATER))).toBe(true);
  });
});

describe('Appraisal.recordResult', () => {
  it('records the result, trims the texts and reports the change', () => {
    const appraisal = restored();
    expect(unwrap(appraisal.recordResult(RESULT, LATER))).toBe(true);

    expect(appraisal.result).toEqual({
      ...RESULT,
      comparables: [{ ...COMPARABLE, address: 'Mitre 1500', url: undefined }],
      observations: 'Muy luminoso.',
    });
    expect(appraisal.toSnapshot().updatedAt).toEqual(LATER);
    expect(appraisal.pullEvents().map((e) => e.type)).toEqual([
      'appraisals.appraisal_result_recorded',
    ]);
    expect(unwrap(appraisal.recordResult(RESULT, LATER))).toBe(false);
  });

  it('rejects a minimum above the maximum or a negative value', () => {
    const appraisal = restored();
    const sale = { minCents: 2n, maxCents: 1n, currency: 'USD' } as const;
    expect(unwrapErr(appraisal.recordResult({ ...RESULT, sale }, LATER))).toEqual({
      type: 'InvalidValueRange',
      operation: 'sale',
    });
    const rent = { minCents: -1n, maxCents: 1n, currency: 'ARS' } as const;
    expect(unwrapErr(appraisal.recordResult({ ...RESULT, rent }, LATER))).toEqual({
      type: 'InvalidValueRange',
      operation: 'rent',
    });
  });

  it('rejects an invalid comparable or too many of them', () => {
    const appraisal = restored();
    const comparables = [COMPARABLE, { ...COMPARABLE, address: ' ' }];
    expect(unwrapErr(appraisal.recordResult({ ...RESULT, comparables }, LATER))).toEqual({
      type: 'InvalidComparable',
      index: 1,
    });
    const many = Array.from({ length: MAX_APPRAISAL_COMPARABLES + 1 }, () => COMPARABLE);
    expect(unwrapErr(appraisal.recordResult({ ...RESULT, comparables: many }, LATER))).toEqual({
      type: 'TooManyComparables',
      max: MAX_APPRAISAL_COMPARABLES,
    });
  });

  it('keeps a value while the appraisal is appraised', () => {
    const appraisal = restored({ status: 'appraised', result: RESULT });
    expect(unwrapErr(appraisal.recordResult(EMPTY_APPRAISAL_RESULT, LATER))).toEqual({
      type: 'AppraisalValueRequired',
    });
  });

  it('rejects changing a converted or deleted appraisal', () => {
    expect(unwrapErr(restored({ status: 'converted' }).recordResult(RESULT, LATER))).toEqual({
      type: 'AppraisalConverted',
    });
    expect(unwrapErr(restored({ deletedAt: LATER }).recordResult(RESULT, LATER))).toEqual({
      type: 'AppraisalDeleted',
    });
  });
});

describe('comparablePricePerM2Cents', () => {
  it('divides the price by the surface, rounded to the cent', () => {
    expect(comparablePricePerM2Cents(COMPARABLE)).toBe(181_538n);
    expect(comparablePricePerM2Cents({ ...COMPARABLE, priceCents: 100n, surfaceM2: 0.03 })).toBe(
      3333n,
    );
  });

  it('is undefined without a surface', () => {
    expect(comparablePricePerM2Cents({ ...COMPARABLE, surfaceM2: undefined })).toBeUndefined();
    expect(comparablePricePerM2Cents({ ...COMPARABLE, surfaceM2: 0 })).toBeUndefined();
  });
});

describe('Appraisal.convert', () => {
  it('marks it converted and sends what the draft property needs', () => {
    const appraiserUserId = '00000000-0000-7000-8000-0000000000a2';
    const appraisal = restored({
      status: 'appraised',
      appraiserUserId,
      result: {
        ...RESULT,
        rent: { minCents: 50_000_000n, maxCents: 60_000_000n, currency: 'ARS' },
      },
    });
    unwrap(appraisal.convert({ propertyId: PROPERTY_ID, photoKeys: ['k1', 'k2'] }, LATER));

    expect(appraisal.toSnapshot()).toMatchObject({
      status: 'converted',
      statusChangedAt: LATER,
      convertedPropertyId: PROPERTY_ID,
    });
    expect(appraisal.pullEvents()).toEqual([
      {
        type: 'appraisals.appraisal_converted',
        aggregateId: ID,
        occurredAt: LATER,
        payload: {
          appraisalId: ID,
          requesterClientId: DETAILS.requesterClientId,
          listing: {
            propertyId: PROPERTY_ID,
            appraisalCode: 'TAS0001',
            propertyType: 'house',
            address: 'Mitre 1234',
            surfaceTotalM2: 300,
            surfaceCoveredM2: 180.5,
            rooms: 5,
            bedrooms: 3,
            bathrooms: 2,
            condition: 'good',
            producerUserId: DETAILS.producerUserId,
            branchId: DETAILS.branchId,
            appraiserUserId,
            sale: { priceCents: '12000000', currency: 'USD' },
            rent: { priceCents: '60000000', currency: 'ARS' },
            photoKeys: ['k1', 'k2'],
          },
        },
      },
    ]);
  });

  it('leaves out the fields without data', () => {
    const appraisal = restored({
      status: 'appraised',
      result: RESULT,
      address: undefined,
      rooms: undefined,
      condition: undefined,
    });
    unwrap(appraisal.convert({ propertyId: PROPERTY_ID, photoKeys: [] }, LATER));
    const [event] = appraisal.pullEvents();
    const listing = event?.type === 'appraisals.appraisal_converted' ? event.payload.listing : {};
    expect(listing).not.toHaveProperty('address');
    expect(listing).not.toHaveProperty('rooms');
    expect(listing).not.toHaveProperty('rent');
    expect(listing).toHaveProperty('sale');
  });

  it('converts only once, and only an appraised appraisal', () => {
    const input = { propertyId: PROPERTY_ID, photoKeys: [] };
    const appraisal = restored({ status: 'appraised', result: RESULT });
    unwrap(appraisal.convert(input, LATER));
    expect(unwrapErr(appraisal.convert(input, LATER))).toEqual({ type: 'AppraisalConverted' });
    expect(unwrapErr(restored().convert(input, LATER))).toEqual({
      type: 'AppraisalNotAppraised',
    });
    const deleted = restored({ status: 'appraised', deletedAt: LATER });
    expect(unwrapErr(deleted.convert(input, LATER))).toEqual({ type: 'AppraisalDeleted' });
  });
});

describe('Appraisal.removePhoto', () => {
  it('records the file to delete', () => {
    const appraisal = restored();
    unwrap(appraisal.removePhoto('appraisals/x/photos/y/original', LATER));
    expect(appraisal.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'appraisals.appraisal_photo_deleted',
        payload: {
          appraisalId: ID,
          requesterClientId: DETAILS.requesterClientId,
          storageKeys: ['appraisals/x/photos/y/original'],
        },
      }),
    ]);
  });

  it('rejects a converted appraisal', () => {
    expect(unwrapErr(restored({ status: 'converted' }).removePhoto('k', LATER))).toEqual({
      type: 'AppraisalConverted',
    });
  });
});

describe('appraisal photos', () => {
  it('accept images up to the size limit', () => {
    unwrap(validateAppraisalPhoto({ contentType: 'image/jpeg', sizeBytes: 1000 }));
    expect(
      unwrapErr(validateAppraisalPhoto({ contentType: 'application/pdf', sizeBytes: 1000 })),
    ).toEqual({ type: 'UnsupportedPhotoType' });
    const tooLarge = { contentType: 'image/png', sizeBytes: MAX_APPRAISAL_PHOTO_BYTES + 1 };
    expect(unwrapErr(validateAppraisalPhoto(tooLarge))).toEqual({
      type: 'PhotoTooLarge',
      maxBytes: MAX_APPRAISAL_PHOTO_BYTES,
    });
  });

  it('have a limit per appraisal', () => {
    unwrap(checkPhotoRoom(MAX_APPRAISAL_PHOTOS - 1));
    expect(unwrapErr(checkPhotoRoom(MAX_APPRAISAL_PHOTOS))).toEqual({
      type: 'TooManyPhotos',
      max: MAX_APPRAISAL_PHOTOS,
    });
  });
});

describe('Appraisal trash', () => {
  it('deletes and restores', () => {
    const appraisal = restored();
    unwrap(appraisal.delete('user-1', LATER));
    expect(appraisal.toSnapshot()).toMatchObject({ deletedAt: LATER, deletedBy: 'user-1' });
    expect(unwrapErr(appraisal.delete('user-1', LATER))).toEqual({
      type: 'AppraisalAlreadyDeleted',
    });

    unwrap(appraisal.restoreFromTrash(LATER));
    expect(appraisal.isDeleted).toBe(false);
    expect(unwrapErr(appraisal.restoreFromTrash(LATER))).toEqual({ type: 'AppraisalNotDeleted' });
    expect(appraisal.pullEvents().map((e) => e.type)).toEqual([
      'appraisals.appraisal_deleted',
      'appraisals.appraisal_restored',
    ]);
  });
});

describe('appraisal statuses', () => {
  it('ends at converted', () => {
    expect(canAppraisalTransition('appraised', 'converted')).toBe(true);
    expect(canAppraisalTransition('converted', 'discarded')).toBe(false);
    expect(canAppraisalTransition('requested', 'converted')).toBe(false);
  });

  it('groups them as Tokko does', () => {
    expect(statusesOfGroup('pending')).toEqual(['requested', 'visit_scheduled']);
    expect(statusesOfGroup('converted')).toEqual(['converted']);
  });
});

describe('catalogs', () => {
  it('match the lists of the contracts', () => {
    expect([...APPRAISAL_STATUS_VALUES]).toEqual([...APPRAISAL_STATUSES]);
    expect([...APPRAISAL_STATUS_GROUP_VALUES]).toEqual([...APPRAISAL_STATUS_GROUPS]);
    expect([...APPRAISAL_SOURCE_VALUES]).toEqual([...APPRAISAL_SOURCES]);
    expect([...PROPERTY_TYPES]).toEqual([...APPRAISAL_PROPERTY_TYPES]);
    expect([...CONDITION_VALUES]).toEqual([...APPRAISAL_CONDITIONS]);
    expect([...CURRENCIES]).toEqual([...APPRAISAL_CURRENCIES]);
    expect([...APPRAISAL_PHOTO_TYPE_VALUES]).toEqual([...APPRAISAL_PHOTO_TYPES]);
    expect(MAX_COMPARABLES_VALUE).toBe(MAX_APPRAISAL_COMPARABLES);
    expect(MAX_PHOTO_BYTES_VALUE).toBe(MAX_APPRAISAL_PHOTO_BYTES);
    expect(MAX_PHOTOS_VALUE).toBe(MAX_APPRAISAL_PHOTOS);
  });
});
