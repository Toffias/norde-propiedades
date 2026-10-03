import { describe, expect, it } from 'vitest';

import { MAX_AGENT_WEIGHT, MIN_AGENT_WEIGHT, parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import {
  CONSTRUCTION_STATUS_VALUES,
  DEVELOPMENT_STATUS_VALUES,
  DEVELOPMENT_TYPES,
  MAX_DEVELOPMENT_CHANCE_WEIGHT,
  MAX_DEVELOPMENT_CHANCES,
  MIN_DEVELOPMENT_CHANCE_WEIGHT,
} from '../contracts';
import { developmentSnapshot, TEST_NOW } from '../testing';

import { Coordinates } from './coordinates';
import {
  CONSTRUCTION_STATUSES,
  Development,
  DEVELOPMENT_KINDS,
  DEVELOPMENT_STATUSES,
  MAX_DEVELOPMENT_CHANCE_AGENTS,
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
    expect(MAX_DEVELOPMENT_CHANCES).toBe(MAX_DEVELOPMENT_CHANCE_AGENTS);
    expect([MIN_DEVELOPMENT_CHANCE_WEIGHT, MAX_DEVELOPMENT_CHANCE_WEIGHT]).toEqual([
      MIN_AGENT_WEIGHT,
      MAX_AGENT_WEIGHT,
    ]);
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

describe('Development chances', () => {
  const A = { userId: 'u-a', weight: 2 };
  const B = { userId: 'u-b', weight: 1 };
  const BOTH = new Set(['u-a', 'u-b']);

  it('starts without chances', () => {
    const development = newDevelopment();
    expect(development.hasChances).toBe(false);
    expect(development.toSnapshot()).toMatchObject({ chances: [], inquiryRouteCursor: 0n });
  });

  it('gives each agent as many inquiries as its weight, interleaved', () => {
    const development = Development.restore(developmentSnapshot());
    expect(unwrap(development.setChances([A, B], LATER))).toBe(true);
    expect(development.hasChances).toBe(true);
    const turns = Array.from({ length: 6 }, () => development.takeInquiryTurn(BOTH));
    expect(turns).toEqual(['u-a', 'u-b', 'u-a', 'u-a', 'u-b', 'u-a']);
    expect(development.toSnapshot().inquiryRouteCursor).toBe(6n);
  });

  it('skips inactive agents and does not advance without active ones', () => {
    const development = Development.restore(developmentSnapshot({ chances: [A, B] }));
    expect(development.takeInquiryTurn(new Set(['u-b']))).toBe('u-b');
    expect(development.takeInquiryTurn(new Set())).toBeUndefined();
    expect(development.toSnapshot().inquiryRouteCursor).toBe(1n);
  });

  it('does not touch the modification date when it takes a turn', () => {
    const development = Development.restore(developmentSnapshot({ chances: [A] }));
    const before = development.toSnapshot().updatedAt;
    development.takeInquiryTurn(BOTH);
    expect(development.toSnapshot().updatedAt).toBe(before);
  });

  it('restarts the distribution when the chances change, not when they are the same', () => {
    const development = Development.restore(
      developmentSnapshot({ chances: [A, B], inquiryRouteCursor: 5n }),
    );
    expect(unwrap(development.setChances([A, B], LATER))).toBe(false);
    expect(development.toSnapshot().inquiryRouteCursor).toBe(5n);
    expect(unwrap(development.setChances([B, A], LATER))).toBe(true);
    expect(development.toSnapshot()).toMatchObject({
      chances: [B, A],
      inquiryRouteCursor: 0n,
      updatedAt: LATER,
    });
  });

  it('turns off with no agents', () => {
    const development = Development.restore(developmentSnapshot({ chances: [A] }));
    expect(unwrap(development.setChances([], LATER))).toBe(true);
    expect(development.hasChances).toBe(false);
    expect(development.takeInquiryTurn(BOTH)).toBeUndefined();
  });

  it('rejects repeated agents, weights out of range and too many agents', () => {
    const development = Development.restore(developmentSnapshot());
    expect(unwrapErr(development.setChances([A, { ...A, weight: 1 }], LATER))).toEqual({
      type: 'InvalidDevelopmentChances',
      reason: 'duplicate_agent',
    });
    for (const weight of [0, 11, 1.5]) {
      expect(unwrapErr(development.setChances([{ userId: 'u-a', weight }], LATER))).toEqual({
        type: 'InvalidDevelopmentChances',
        reason: 'weight',
      });
    }
    const many = Array.from({ length: MAX_DEVELOPMENT_CHANCE_AGENTS + 1 }, (_, i) => ({
      userId: `u-${String(i)}`,
      weight: 1,
    }));
    expect(unwrapErr(development.setChances(many, LATER))).toEqual({
      type: 'InvalidDevelopmentChances',
      reason: 'too_many_agents',
    });
  });

  it('does not derive from the trash nor change its chances there', () => {
    const development = Development.restore(
      developmentSnapshot({ chances: [A], deletedAt: LATER, deletedBy: 'u-1' }),
    );
    expect(development.hasChances).toBe(false);
    expect(development.takeInquiryTurn(BOTH)).toBeUndefined();
    expect(unwrapErr(development.setChances([B], LATER))).toEqual({ type: 'DevelopmentInTrash' });
  });
});
