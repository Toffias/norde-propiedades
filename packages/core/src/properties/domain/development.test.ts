import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import {
  CONSTRUCTION_STATUS_VALUES,
  DEVELOPMENT_STATUS_VALUES,
  DEVELOPMENT_TYPES,
} from '../contracts';
import { developmentSnapshot, TEST_NOW } from '../testing';

import { Coordinates } from './coordinates';
import {
  CONSTRUCTION_STATUSES,
  Development,
  DEVELOPMENT_KINDS,
  DEVELOPMENT_STATUSES,
  suggestDevelopmentPublishAddress,
  type NewDevelopment,
} from './development';

const LATER = new Date('2026-10-02T12:00:00Z');

function newDevelopment(overrides: Partial<NewDevelopment> = {}): Development {
  return Development.create({
    id: unwrap(parseId<'Development'>('00000000-0000-7000-8000-0000000000e9')),
    code: 'EMP0009',
    name: '  Torre Río  ',
    kind: 'building',
    privateAddress: 'Av. del Libertador 5420',
    publishAddress: undefined,
    portalTitle: undefined,
    developerName: '  ',
    commercialContactClientId: undefined,
    locationId: '00000000-0000-7000-8000-00000000d004',
    coordinates: undefined,
    producerUserId: 'u-1',
    branchId: 'b-1',
    now: TEST_NOW,
    ...overrides,
  });
}

describe('Development values', () => {
  it('match the contracts', () => {
    expect([...DEVELOPMENT_STATUSES]).toEqual([...DEVELOPMENT_STATUS_VALUES]);
    expect([...DEVELOPMENT_KINDS]).toEqual([...DEVELOPMENT_TYPES]);
    expect([...CONSTRUCTION_STATUSES]).toEqual([...CONSTRUCTION_STATUS_VALUES]);
  });
});

describe('suggestDevelopmentPublishAddress', () => {
  it('rounds the street number to the hundred', () => {
    expect(suggestDevelopmentPublishAddress('Gurruchaga 1834')).toBe('Gurruchaga al 1800');
    expect(suggestDevelopmentPublishAddress('Av. del Libertador 5420')).toBe(
      'Av. del Libertador al 5400',
    );
  });

  it('keeps the address when it does not end in a number', () => {
    expect(suggestDevelopmentPublishAddress('Ruta 8 km 50 ')).toBe('Ruta 8 km 50');
    expect(suggestDevelopmentPublishAddress('Barrio Los Álamos')).toBe('Barrio Los Álamos');
  });
});

describe('Development.create', () => {
  it('starts loading information, with suggested texts and a created event', () => {
    const development = newDevelopment();
    const s = development.toSnapshot();

    expect(s).toMatchObject({
      name: 'Torre Río',
      status: 'loading',
      slug: 'torre-rio-emp0009',
      publishAddress: 'Av. del Libertador al 5400',
      portalTitle: 'Torre Río',
      developerName: undefined,
      featureIds: [],
      tagIds: [],
    });
    expect(development.pullEvents()).toEqual([
      expect.objectContaining({
        type: 'properties.development_created',
        payload: { developmentId: development.id, code: 'EMP0009' },
      }),
    ]);
  });

  it('keeps the publish address and portal title that were typed', () => {
    const s = newDevelopment({
      publishAddress: 'Libertador y Pampa',
      portalTitle: 'Torre Río: frente al río',
    }).toSnapshot();
    expect(s.publishAddress).toBe('Libertador y Pampa');
    expect(s.portalTitle).toBe('Torre Río: frente al río');
  });
});

describe('Development status', () => {
  it('moves between loading and marketing, and reports no change', () => {
    const development = Development.restore(developmentSnapshot());

    expect(unwrap(development.changeStatus('marketing', LATER))).toBe(true);
    expect(development.status).toBe('marketing');
    expect(unwrap(development.changeStatus('marketing', LATER))).toBe(false);
    expect(unwrap(development.changeStatus('loading', LATER))).toBe(true);
    expect(development.pullEvents().map((event) => event.type)).toEqual([
      'properties.development_status_changed',
      'properties.development_status_changed',
    ]);
  });

  it('is not edited while in the trash', () => {
    const development = Development.restore(developmentSnapshot({ deletedAt: TEST_NOW }));
    expect(unwrapErr(development.changeStatus('marketing', LATER))).toEqual({
      type: 'DevelopmentInTrash',
    });
    expect(
      unwrapErr(
        development.updateGeneral(
          {
            name: 'Otro',
            kind: 'building',
            portalTitle: undefined,
            developerName: undefined,
            commercialContactClientId: undefined,
            websiteUrl: undefined,
          },
          LATER,
        ),
      ),
    ).toEqual({ type: 'DevelopmentInTrash' });
    expect(unwrapErr(development.unitTemplate())).toEqual({ type: 'DevelopmentInTrash' });
  });
});

describe('Development edits', () => {
  it('updates the general data and falls back to the name as portal title', () => {
    const development = Development.restore(developmentSnapshot());
    const change = {
      name: 'Torre Gurruchaga II',
      kind: 'building' as const,
      portalTitle: ' ',
      developerName: 'Constructora Sur',
      commercialContactClientId: undefined,
      websiteUrl: 'https://torre.example.com',
    };

    expect(unwrap(development.updateGeneral(change, LATER))).toBe(true);
    expect(development.toSnapshot()).toMatchObject({
      name: 'Torre Gurruchaga II',
      portalTitle: 'Torre Gurruchaga II',
      developerName: 'Constructora Sur',
      slug: 'torre-gurruchaga-emp0001',
      updatedAt: LATER,
    });
    expect(unwrap(development.updateGeneral(change, LATER))).toBe(false);
  });

  it('updates the location and suggests the publish address again', () => {
    const development = Development.restore(developmentSnapshot());
    const coordinates = unwrap(Coordinates.create(-34.58, -58.43));
    const change = {
      privateAddress: 'Honduras 5550',
      publishAddress: undefined,
      locationId: 'loc-1',
      coordinates,
    };

    expect(unwrap(development.updateLocation(change, LATER))).toBe(true);
    expect(development.toSnapshot()).toMatchObject({
      privateAddress: 'Honduras 5550',
      publishAddress: 'Honduras al 5500',
      locationId: 'loc-1',
    });
    expect(unwrap(development.updateLocation(change, LATER))).toBe(false);
  });

  it('updates the details and reports no change when they are the same', () => {
    const development = Development.restore(developmentSnapshot());
    const change = {
      constructionStatus: 'under_construction' as const,
      deliveryDate: '2027-12-01',
      description: '  Torre de 12 pisos  ',
      financingDetails: '30 % anticipo y 36 cuotas',
      deal: { isFinanced: true, acceptsSwap: false, immediateDeed: false },
    };

    expect(unwrap(development.updateDetails(change, LATER))).toBe(true);
    expect(development.toSnapshot()).toMatchObject({
      description: 'Torre de 12 pisos',
      deal: { isFinanced: true },
    });
    expect(unwrap(development.updateDetails(change, LATER))).toBe(false);
  });

  it('dedupes features and tags and reports no change in another order', () => {
    const development = Development.restore(developmentSnapshot());
    expect(unwrap(development.updateFeatures(['f1', 'f2', 'f1'], LATER))).toBe(true);
    expect(development.toSnapshot().featureIds).toEqual(['f1', 'f2']);
    expect(unwrap(development.updateFeatures(['f2', 'f1'], LATER))).toBe(false);
    expect(unwrap(development.setTags(['t1'], LATER))).toBe(true);
    expect(unwrap(development.setTags(['t1'], LATER))).toBe(false);
  });
});

describe('Development trash', () => {
  it('cannot be deleted with active units', () => {
    const development = Development.restore(developmentSnapshot());
    expect(unwrapErr(development.delete('u-1', 3, LATER))).toEqual({
      type: 'DevelopmentHasUnits',
      units: 3,
    });
    expect(development.isDeleted).toBe(false);
  });

  it('goes to the trash and comes back', () => {
    const development = Development.restore(developmentSnapshot());
    unwrap(development.delete('u-1', 0, LATER));
    expect(development.toSnapshot()).toMatchObject({ deletedAt: LATER, deletedBy: 'u-1' });
    expect(unwrapErr(development.delete('u-1', 0, LATER))).toEqual({
      type: 'DevelopmentAlreadyDeleted',
    });

    unwrap(development.restoreFromTrash(LATER));
    expect(development.isDeleted).toBe(false);
    expect(unwrapErr(development.restoreFromTrash(LATER))).toEqual({
      type: 'DevelopmentNotDeleted',
    });
    expect(development.pullEvents().map((event) => event.type)).toEqual([
      'properties.development_deleted',
      'properties.development_restored',
    ]);
  });

  it('gives new units its address, location, features and producer', () => {
    const development = Development.restore(
      developmentSnapshot({ featureIds: ['f1'], locationId: 'loc-1' }),
    );
    expect(unwrap(development.unitTemplate())).toMatchObject({
      privateAddress: 'Gurruchaga 1834',
      publishAddress: 'Gurruchaga al 1800',
      locationId: 'loc-1',
      featureIds: ['f1'],
      producerUserId: development.ownership.ownerId,
      branchId: development.ownership.ownerBranchId,
    });
  });
});
