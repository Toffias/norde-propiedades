import { describe, expect, it } from 'vitest';

import { Actor, err, ok, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreatePropertyInput } from '../../contracts';
import {
  BRANCH_ID,
  FakeGeocoder,
  FakeReferenceCodeAllocator,
  InMemoryPropertiesUnitOfWork,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
  TEST_PRODUCER,
} from '../../testing';
import type { LocationKind } from '../../domain/location';
import { CreateProperty } from './create-property';
import { DeleteProperty } from './delete-property';
import { RestoreProperty } from './restore-property';

function setup(
  options: { readonly codesAvailable?: boolean; readonly geocoder?: FakeGeocoder } = {},
) {
  const uow = new InMemoryPropertiesUnitOfWork();
  const codes = new FakeReferenceCodeAllocator(options.codesAvailable ?? true);
  const clock = new FixedClock(TEST_NOW);
  return {
    uow,
    codes,
    create: new CreateProperty({
      uow,
      codes,
      geocoder: options.geocoder ?? new FakeGeocoder(),
      ids: new SequentialIdGenerator(),
      clock,
    }),
    remove: new DeleteProperty({ uow, clock }),
    restore: new RestoreProperty({ uow, clock }),
  };
}

const INPUT: CreatePropertyInput = {
  propertyType: 'apartment',
  operation: 'sale',
  currency: 'USD',
  price: '120000',
  street: 'Gurruchaga',
  streetNumber: '1834',
  floor: '3',
  unit: 'B',
  neighborhood: 'Palermo',
  city: 'CABA',
  province: 'Buenos Aires',
  latitude: -34.5861,
  longitude: -58.4321,
};

const COUNTRY = '00000000-0000-7000-8000-00000000d001';
const PROVINCE = '00000000-0000-7000-8000-00000000d002';
const CITY = '00000000-0000-7000-8000-00000000d003';
const NEIGHBORHOOD = '00000000-0000-7000-8000-00000000d004';

/** Argentina > CABA > CABA > Palermo, como lo carga la migración. */
function withLocations(uow: InMemoryPropertiesUnitOfWork) {
  const node = (
    id: string,
    parent: string | undefined,
    kind: LocationKind,
    name: string,
    path: string,
  ) => ({
    id: unwrap(parseId<'Location'>(id)),
    parentId: parent === undefined ? undefined : unwrap(parseId<'Location'>(parent)),
    kind,
    name,
    path,
    coordinates: undefined,
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
  uow.locations
    .add(node(COUNTRY, undefined, 'country', 'Argentina', `/${COUNTRY}/`))
    .add(node(PROVINCE, COUNTRY, 'province', 'CABA', `/${COUNTRY}/${PROVINCE}/`))
    .add(node(CITY, PROVINCE, 'city', 'CABA', `/${COUNTRY}/${PROVINCE}/${CITY}/`))
    .add(
      node(
        NEIGHBORHOOD,
        CITY,
        'neighborhood',
        'Palermo',
        `/${COUNTRY}/${PROVINCE}/${CITY}/${NEIGHBORHOOD}/`,
      ),
    );
}

describe('CreateProperty', () => {
  it('takes neighborhood, city and province from the chosen location', async () => {
    const { uow, create } = setup();
    withLocations(uow);
    const { neighborhood: _n, city: _c, province: _p, ...withoutPlace } = INPUT;

    const { propertyId } = unwrap(
      await create.execute({ ...withoutPlace, locationId: NEIGHBORHOOD }, TEST_PRODUCER),
    );

    expect(uow.properties.rows.get(propertyId)).toMatchObject({
      locationId: NEIGHBORHOOD,
      address: { neighborhood: 'Palermo', city: 'CABA', province: 'CABA' },
      portalTitle: 'Departamento en venta en Palermo',
    });
    expect(uow.audit.entries[0]?.changes).toMatchObject({
      locationId: { before: null, after: NEIGHBORHOOD },
    });
  });

  it('rejects an unknown location and asks for the place without one', async () => {
    const { create } = setup();
    const { neighborhood: _n, city: _c, province: _p, ...withoutPlace } = INPUT;
    expect(
      unwrapErr(await create.execute({ ...withoutPlace, locationId: NEIGHBORHOOD }, TEST_PRODUCER)),
    ).toEqual({ type: 'LocationNotFound' });
    expect(unwrapErr(await create.execute(withoutPlace, TEST_PRODUCER)).type).toBe('InvalidInput');
  });

  it('rejects a property type the company disabled', async () => {
    const { uow, create } = setup();
    uow.typeSettings.rows.set('apartment', {
      kind: 'apartment',
      isEnabled: false,
      visibleAttributes: [],
    });
    expect(unwrapErr(await create.execute(INPUT, TEST_PRODUCER))).toEqual({
      type: 'PropertyTypeDisabled',
    });
    expect(uow.properties.rows.size).toBe(0);
  });

  it('geocodes the address when the coordinates are empty', async () => {
    const geocoder = new FakeGeocoder(ok({ latitude: -34.58612345, longitude: -58.4321 }));
    const { uow, create } = setup({ geocoder });
    const { latitude: _lat, longitude: _lng, ...withoutCoordinates } = INPUT;

    const output = unwrap(await create.execute(withoutCoordinates, TEST_PRODUCER));

    expect(output.geocoding).toBe('found');
    expect(geocoder.requests).toEqual([
      {
        street: 'Gurruchaga',
        streetNumber: '1834',
        floor: '3',
        unit: 'B',
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'Buenos Aires',
      },
    ]);
    expect(uow.properties.rows.get(output.propertyId)?.coordinates).toMatchObject({
      latitude: -34.586123,
      longitude: -58.4321,
    });
  });

  it('creates the property anyway when the address is not found or the service fails', async () => {
    const { latitude: _lat, longitude: _lng, ...withoutCoordinates } = INPUT;

    const notFound = setup({ geocoder: new FakeGeocoder(ok(undefined)) });
    const missing = unwrap(await notFound.create.execute(withoutCoordinates, TEST_PRODUCER));
    expect(missing.geocoding).toBe('not_found');
    expect(notFound.uow.properties.rows.get(missing.propertyId)?.coordinates).toBeUndefined();

    const failing = setup({ geocoder: new FakeGeocoder(err({ type: 'GeocodingFailed' })) });
    expect(unwrap(await failing.create.execute(withoutCoordinates, TEST_PRODUCER)).geocoding).toBe(
      'failed',
    );
  });

  it('does not geocode when the coordinates were typed', async () => {
    const geocoder = new FakeGeocoder();
    const { create } = setup({ geocoder });
    expect(unwrap(await create.execute(INPUT, TEST_PRODUCER)).geocoding).toBe('manual');
    expect(geocoder.requests).toEqual([]);
  });

  it('creates a draft owned by the actor and audits the initial values', async () => {
    const { uow, codes, create } = setup();

    const output = unwrap(await create.execute(INPUT, TEST_PRODUCER));

    expect(output.code).toBe('DEP0001');
    expect(codes.requests).toEqual([
      { kind: 'apartment', producerUserId: PRODUCER_ID, branchId: BRANCH_ID },
    ]);
    const saved = uow.properties.rows.get(output.propertyId);
    expect(saved).toMatchObject({
      status: 'draft',
      producerUserId: PRODUCER_ID,
      branchId: BRANCH_ID,
      publishAddress: 'Gurruchaga al 1800',
      operations: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['properties.property_created']);
    expect(uow.audit.entries).toHaveLength(1);
    expect(uow.audit.entries[0]).toMatchObject({
      kind: 'created',
      action: 'property.created',
      entityType: 'property',
      entityId: output.propertyId,
      actorId: PRODUCER_ID,
      correlationId: 'req-1',
      clientIds: [],
      changes: {
        code: { before: null, after: 'DEP0001' },
        street: { before: null, after: 'Gurruchaga' },
        latitude: { before: null, after: -34.5861 },
        operations: {
          before: null,
          after: [{ operation: 'sale', currency: 'USD', priceCents: 12_000_000n }],
        },
        producerUserId: { before: null, after: PRODUCER_ID },
      },
    });
  });

  it('converts the price written with decimals to cents', async () => {
    const { uow, create } = setup();
    const { propertyId } = unwrap(
      await create.execute({ ...INPUT, currency: 'ARS', price: '850000,5' }, TEST_PRODUCER),
    );
    expect(uow.properties.rows.get(propertyId)?.operations[0]?.priceCents).toBe(85_000_050n);
  });

  it('accepts a property without a price', async () => {
    const { uow, create } = setup();
    const { price: _price, ...withoutPrice } = INPUT;
    const { propertyId } = unwrap(await create.execute(withoutPrice, TEST_PRODUCER));
    expect(uow.properties.rows.get(propertyId)?.operations[0]?.priceCents).toBeUndefined();
  });

  it('rejects an actor without permission', async () => {
    const { uow, codes, create } = setup();
    expect(unwrapErr(await create.execute(INPUT, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(codes.requests).toEqual([]);
    expect(uow.properties.rows.size).toBe(0);
  });

  it('rejects invalid input', async () => {
    const { create } = setup();
    const error = unwrapErr(
      await create.execute({ ...INPUT, street: ' ', price: '12.000.000' }, TEST_PRODUCER),
    );
    expect(error.type).toBe('InvalidInput');
  });

  it('requires both coordinates or none', async () => {
    const { create } = setup();
    const { longitude: _longitude, ...onlyLatitude } = INPUT;
    expect(unwrapErr(await create.execute(onlyLatitude, TEST_PRODUCER)).type).toBe('InvalidInput');
  });

  it('fails when there is no reference code available', async () => {
    const { uow, create } = setup({ codesAvailable: false });
    expect(unwrapErr(await create.execute(INPUT, TEST_PRODUCER))).toEqual({
      type: 'ReferenceCodeUnavailable',
    });
    expect(uow.audit.entries).toEqual([]);
  });

  it('leaves the producer empty for a system actor', async () => {
    const { uow, create } = setup();
    const importer = Actor.system('import', ['properties:create']);
    const { propertyId } = unwrap(await create.execute(INPUT, importer));
    expect(uow.properties.rows.get(propertyId)?.producerUserId).toBeUndefined();
  });
});

describe('DeleteProperty', () => {
  it('sends the own property to the trash and audits the action', async () => {
    const { uow, remove } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot());

    unwrap(await remove.execute({ propertyId: PROPERTY_ID }, TEST_PRODUCER));

    expect(uow.properties.rows.get(PROPERTY_ID)).toMatchObject({
      deletedAt: TEST_NOW,
      deletedBy: PRODUCER_ID,
    });
    expect(uow.events.published.map((e) => e.type)).toEqual(['properties.property_deleted']);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        kind: 'action',
        action: 'property.deleted',
        entityType: 'property',
        entityId: PROPERTY_ID,
      }),
    ]);
  });

  it("does not let an agent delete someone else's property", async () => {
    const { uow, remove } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot({ producerUserId: OTHER_USER_ID }));

    expect(unwrapErr(await remove.execute({ propertyId: PROPERTY_ID }, TEST_PRODUCER))).toEqual({
      type: 'Forbidden',
    });
    expect(uow.properties.rows.get(PROPERTY_ID)?.deletedAt).toBeUndefined();
  });

  it("lets a manager delete someone else's property", async () => {
    const { uow, remove } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
    unwrap(await remove.execute({ propertyId: PROPERTY_ID }, TEST_MANAGER));
    expect(uow.properties.rows.get(PROPERTY_ID)?.deletedBy).toBe(OTHER_USER_ID);
  });

  it('rejects an actor without permission', async () => {
    const { uow, remove } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
    expect(unwrapErr(await remove.execute({ propertyId: PROPERTY_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('reports a missing property and one already in the trash', async () => {
    const { uow, remove } = setup();
    expect(unwrapErr(await remove.execute({ propertyId: PROPERTY_ID }, TEST_MANAGER))).toEqual({
      type: 'PropertyNotFound',
    });

    uow.properties.rows.set(PROPERTY_ID, propertySnapshot({ deletedAt: TEST_NOW }));
    expect(unwrapErr(await remove.execute({ propertyId: PROPERTY_ID }, TEST_MANAGER))).toEqual({
      type: 'PropertyAlreadyDeleted',
    });
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an invalid ID', async () => {
    const { remove } = setup();
    expect(unwrapErr(await remove.execute({ propertyId: 'nope' }, TEST_MANAGER)).type).toBe(
      'InvalidInput',
    );
  });
});

describe('RestoreProperty', () => {
  it('restores a property from the trash and audits the action', async () => {
    const { uow, restore } = setup();
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({ deletedAt: TEST_NOW, deletedBy: PRODUCER_ID }),
    );

    unwrap(await restore.execute({ propertyId: PROPERTY_ID }, TEST_PRODUCER));

    expect(uow.properties.rows.get(PROPERTY_ID)).toMatchObject({
      deletedAt: undefined,
      deletedBy: undefined,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({ kind: 'action', action: 'property.restored' }),
    ]);
  });

  it("does not let an agent restore someone else's property", async () => {
    const { uow, restore } = setup();
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({ producerUserId: OTHER_USER_ID, deletedAt: TEST_NOW }),
    );
    expect(unwrapErr(await restore.execute({ propertyId: PROPERTY_ID }, TEST_PRODUCER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('rejects an actor without permission', async () => {
    const { restore } = setup();
    expect(unwrapErr(await restore.execute({ propertyId: PROPERTY_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });

  it('reports a property that is not in the trash', async () => {
    const { uow, restore } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
    expect(unwrapErr(await restore.execute({ propertyId: PROPERTY_ID }, TEST_MANAGER))).toEqual({
      type: 'PropertyNotDeleted',
    });
    expect(unwrapErr(await restore.execute({ propertyId: OTHER_USER_ID }, TEST_MANAGER))).toEqual({
      type: 'PropertyNotFound',
    });
  });
});
