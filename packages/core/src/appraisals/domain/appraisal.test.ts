import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared/domain/id';
import { unwrap, unwrapErr } from '../../shared/testing';
import {
  APPRAISAL_SOURCE_VALUES,
  APPRAISAL_STATUS_GROUP_VALUES,
  APPRAISAL_STATUS_VALUES,
  CONDITION_VALUES,
  PROPERTY_TYPES,
} from '../contracts';
import { appraisalSnapshot, TEST_NOW } from '../testing';

import { Appraisal, appraisalCode, type AppraisalDetails } from './appraisal';
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
  });
});
