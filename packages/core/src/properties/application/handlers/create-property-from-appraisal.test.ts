import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { InMemoryFileStorage } from '../../../settings/testing';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreatePropertyFromAppraisalInput } from '../../contracts';
import {
  BRANCH_ID,
  CLIENT_ID,
  FakeReferenceCodeAllocator,
  InMemoryPropertiesUnitOfWork,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_NOW,
} from '../../testing';

import { CreatePropertyFromAppraisal } from './create-property-from-appraisal';

const ACTOR = Actor.system('scheduler', ['properties:create-from-appraisal']);
const APPRAISAL_ID = '00000000-0000-7000-8000-0000000000d9';
const PHOTO_A = `appraisals/${APPRAISAL_ID}/photos/00000000-0000-7000-8000-0000000000f1/original`;
const PHOTO_B = `appraisals/${APPRAISAL_ID}/photos/00000000-0000-7000-8000-0000000000f2/original`;
const FIRST_MEDIA = '00000000-0000-7000-8000-000000000001';
const SECOND_MEDIA = '00000000-0000-7000-8000-000000000002';

const INPUT: CreatePropertyFromAppraisalInput = {
  appraisalId: APPRAISAL_ID,
  requesterClientId: CLIENT_ID,
  listing: {
    propertyId: PROPERTY_ID,
    appraisalCode: 'TAS0007',
    propertyType: 'house',
    address: 'Mitre 1234',
    surfaceTotalM2: 300,
    surfaceCoveredM2: 180.5,
    rooms: 5,
    bedrooms: 3,
    bathrooms: 2,
    condition: 'good',
    producerUserId: PRODUCER_ID,
    branchId: BRANCH_ID,
    appraiserUserId: OTHER_USER_ID,
    sale: { priceCents: '12000000', currency: 'USD' },
    rent: { priceCents: '60000000', currency: 'ARS' },
    photoKeys: [PHOTO_A, PHOTO_B],
  },
};

async function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  const storage = new InMemoryFileStorage();
  for (const key of [PHOTO_A, PHOTO_B]) {
    await storage.put({ key, contentType: 'image/jpeg', bytes: new Uint8Array([1, 2]) });
  }
  const codes = new FakeReferenceCodeAllocator();
  const useCase = new CreatePropertyFromAppraisal({
    uow,
    codes,
    storage,
    ids: new SequentialIdGenerator(),
    clock: new FixedClock(TEST_NOW),
  });
  return { uow, storage, codes, useCase };
}

describe('CreatePropertyFromAppraisal', () => {
  it('creates the draft with the data of the appraisal', async () => {
    const { uow, codes, useCase } = await setup();

    expect(unwrap(await useCase.execute(INPUT, ACTOR))).toBe('created');

    const property = uow.properties.rows.get(PROPERTY_ID);
    expect(property).toMatchObject({
      code: 'DEP0001',
      kind: 'house',
      status: 'draft',
      address: { street: 'Mitre 1234', neighborhood: '', city: '' },
      producerUserId: PRODUCER_ID,
      branchId: BRANCH_ID,
      characteristics: {
        rooms: 5,
        bedrooms: 3,
        bathrooms: 2,
        condition: 'good',
        surfaceTotalM2: 300,
        surfaceCoveredM2: 180.5,
      },
      internal: { appraiserUserIds: [OTHER_USER_ID] },
    });
    expect(property?.operations.map((o) => [o.operation, o.currency, o.priceCents])).toEqual([
      ['sale', 'USD', 12_000_000n],
      ['rent', 'ARS', 60_000_000n],
    ]);
    expect(codes.requests).toEqual([
      { kind: 'house', producerUserId: PRODUCER_ID, branchId: BRANCH_ID },
    ]);
    expect([...uow.owners.rows.keys()]).toEqual([`${PROPERTY_ID}:${CLIENT_ID}`]);
    expect(uow.audit.entries[0]).toEqual(
      expect.objectContaining({
        kind: 'created',
        action: 'property.created_from_appraisal',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT_ID],
        changes: expect.objectContaining({
          appraisalId: { before: null, after: APPRAISAL_ID },
          appraisalCode: { before: null, after: 'TAS0007' },
          ownerClientIds: { before: null, after: [CLIENT_ID] },
          appraiserUserIds: { before: null, after: [OTHER_USER_ID] },
        }) as unknown,
      }),
    );
  });

  it('copies the photos to the gallery, the first one as the cover', async () => {
    const { uow, storage, useCase } = await setup();
    unwrap(await useCase.execute(INPUT, ACTOR));

    const media = [...uow.media.rows.values()];
    expect(media.map((m) => [m.id, m.position, m.isCover, m.processing])).toEqual([
      [FIRST_MEDIA, 0, true, 'pending'],
      [SECOND_MEDIA, 1, false, 'pending'],
    ]);
    const copy = `properties/${PROPERTY_ID}/media/${FIRST_MEDIA}/original`;
    expect(storage.objects.get(copy)?.contentType).toBe('image/jpeg');
    // La tasación conserva sus fotos.
    expect(storage.objects.has(PHOTO_A)).toBe(true);
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'properties.property_created',
      // La segunda operación (alquiler), como al crear una unidad con dos.
      'properties.property_price_changed',
      'properties.media_variants_requested',
      'properties.media_variants_requested',
    ]);
    expect(uow.audit.entries.map((e) => e.action)).toEqual([
      'property.created_from_appraisal',
      'property.media_added',
      'property.media_added',
    ]);
  });

  it('skips the photos that are gone and the surfaces that do not add up', async () => {
    const { uow, storage, useCase } = await setup();
    await storage.delete(PHOTO_B);
    const listing = { ...INPUT.listing, surfaceCoveredM2: 400 };

    unwrap(await useCase.execute({ ...INPUT, listing }, ACTOR));

    expect(uow.media.rows.size).toBe(1);
    expect(uow.properties.rows.get(PROPERTY_ID)?.characteristics).toMatchObject({
      rooms: 5,
      surfaceTotalM2: undefined,
      surfaceCoveredM2: undefined,
    });
  });

  it('does nothing when the property already exists', async () => {
    const { uow, storage, codes, useCase } = await setup();
    const existing = propertySnapshot();
    uow.properties.rows.set(existing.id, existing);

    expect(unwrap(await useCase.execute(INPUT, ACTOR))).toBe('exists');
    expect(codes.requests).toEqual([]);
    expect(uow.audit.entries).toEqual([]);
    expect(storage.objects.size).toBe(2);
  });

  it('deletes the copies when the draft cannot be saved', async () => {
    const { uow, storage, useCase } = await setup();
    uow.owners.add = () => Promise.reject(new Error('database down'));

    await expect(useCase.execute(INPUT, ACTOR)).rejects.toThrow('database down');
    expect([...storage.objects.keys()]).toEqual([PHOTO_A, PHOTO_B]);
    expect(uow.properties.rows.size).toBe(0);
  });

  it('reports a code that cannot be allocated', async () => {
    const uow = new InMemoryPropertiesUnitOfWork();
    const useCase = new CreatePropertyFromAppraisal({
      uow,
      codes: new FakeReferenceCodeAllocator(false),
      storage: new InMemoryFileStorage(),
      ids: new SequentialIdGenerator(),
      clock: new FixedClock(TEST_NOW),
    });
    expect(unwrapErr(await useCase.execute(INPUT, ACTOR))).toEqual({
      type: 'ReferenceCodeUnavailable',
    });
  });

  it('needs properties:create-from-appraisal and a suggested value', async () => {
    const { useCase } = await setup();
    const scheduler = Actor.system('scheduler', ['properties:create']);
    expect(unwrapErr(await useCase.execute(INPUT, scheduler))).toEqual({ type: 'Forbidden' });

    const { sale: _sale, rent: _rent, ...withoutValues } = INPUT.listing;
    const error = unwrapErr(await useCase.execute({ ...INPUT, listing: withoutValues }, ACTOR));
    expect(error.type).toBe('InvalidInput');
  });
});
