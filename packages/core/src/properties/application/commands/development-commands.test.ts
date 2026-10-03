import { describe, expect, it } from 'vitest';

import { Actor, err, ok, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { CreateDevelopmentInput, CreateDevelopmentUnitInput } from '../../contracts';
import { Coordinates } from '../../domain/coordinates';
import type { LocationKind } from '../../domain/location';
import {
  BRANCH_ID,
  DEVELOPMENT_ID,
  developmentSnapshot,
  FakeDevelopmentCodeAllocator,
  FakeGeocoder,
  FakeReferenceCodeAllocator,
  InMemoryPropertiesUnitOfWork,
  OTHER_USER_ID,
  PRODUCER_ID,
  propertySnapshot,
  TEST_DEVELOPER,
  TEST_DEVELOPMENTS_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { ChangeDevelopmentStatus } from './change-development-status';
import { ChangeDevelopmentTags } from './change-development-tags';
import { CreateDevelopment } from './create-development';
import { CreateDevelopmentUnit } from './create-development-unit';
import { DeleteDevelopment } from './delete-development';
import { RestoreDevelopment } from './restore-development';
import { UpdateDevelopmentDetails } from './update-development-details';
import { UpdateDevelopmentFeatures } from './update-development-features';
import { UpdateDevelopmentGeneral } from './update-development-general';
import { UpdateDevelopmentLocation } from './update-development-location';

const COUNTRY = '00000000-0000-7000-8000-00000000d001';
const PROVINCE = '00000000-0000-7000-8000-00000000d002';
const CITY = '00000000-0000-7000-8000-00000000d003';
const NEIGHBORHOOD = '00000000-0000-7000-8000-00000000d004';
const FEATURE = '00000000-0000-7000-8000-0000000000f1';
const TAG = '00000000-0000-7000-8000-0000000000f2';
const CLIENT = '00000000-0000-7000-8000-0000000000f3';
const OTHER_CLIENT = '00000000-0000-7000-8000-0000000000f4';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';

/** Edita los emprendimientos de su sucursal. */
const BRANCH_EDITOR = Actor.user('00000000-0000-7000-8000-0000000000a4', [
  'developments:read',
  'developments:update-branch',
  'properties:create',
]).withBranch(BRANCH_ID);
/** De otra sucursal, con el mismo permiso. */
const OTHER_BRANCH_EDITOR = Actor.user('00000000-0000-7000-8000-0000000000a5', [
  'developments:read',
  'developments:update-branch',
  'properties:create',
]).withBranch(OTHER_BRANCH);

function setup(options: { readonly geocoder?: FakeGeocoder; readonly codes?: boolean } = {}) {
  const uow = new InMemoryPropertiesUnitOfWork();
  const clock = new FixedClock(TEST_NOW);
  const ids = new SequentialIdGenerator();
  const geocoder = options.geocoder ?? new FakeGeocoder();
  const developmentCodes = new FakeDevelopmentCodeAllocator(options.codes ?? true);
  const propertyCodes = new FakeReferenceCodeAllocator(options.codes ?? true);
  withLocations(uow);
  return {
    uow,
    geocoder,
    developmentCodes,
    propertyCodes,
    create: new CreateDevelopment({ uow, codes: developmentCodes, geocoder, ids, clock }),
    general: new UpdateDevelopmentGeneral({ uow, clock }),
    location: new UpdateDevelopmentLocation({ uow, geocoder, clock }),
    details: new UpdateDevelopmentDetails({ uow, clock }),
    status: new ChangeDevelopmentStatus({ uow, clock }),
    features: new UpdateDevelopmentFeatures({ uow, clock }),
    tags: new ChangeDevelopmentTags({ uow, clock }),
    remove: new DeleteDevelopment({ uow, clock }),
    restore: new RestoreDevelopment({ uow, clock }),
    unit: new CreateDevelopmentUnit({ uow, codes: propertyCodes, ids, clock }),
  };
}

/** Argentina > CABA > CABA > Palermo. */
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

function withDevelopment(
  uow: InMemoryPropertiesUnitOfWork,
  overrides: Parameters<typeof developmentSnapshot>[0] = {},
) {
  const snapshot = developmentSnapshot({ locationId: NEIGHBORHOOD, ...overrides });
  uow.developments.rows.set(snapshot.id, snapshot);
  return snapshot;
}

function stored(uow: InMemoryPropertiesUnitOfWork) {
  const row = uow.developments.rows.get(DEVELOPMENT_ID);
  if (!row) throw new Error('The development was not stored');
  return row;
}

const INPUT: CreateDevelopmentInput = {
  name: 'Torre Gurruchaga',
  developmentType: 'building',
  privateAddress: 'Gurruchaga 1834',
  developerName: 'Constructora Sur',
  commercialContactClientId: CLIENT,
  locationId: NEIGHBORHOOD,
  latitude: -34.5861,
  longitude: -58.4321,
};

describe('CreateDevelopment', () => {
  it('creates it loading information, owned by the actor, and audits the initial values', async () => {
    const { uow, create, developmentCodes } = setup();

    const output = unwrap(await create.execute(INPUT, TEST_DEVELOPER));

    expect(output).toMatchObject({ code: 'EMP0001', geocoding: 'manual' });
    expect(developmentCodes.requests).toEqual([
      { producerUserId: PRODUCER_ID, branchId: BRANCH_ID },
    ]);
    expect(uow.developments.rows.get(output.developmentId)).toMatchObject({
      status: 'loading',
      publishAddress: 'Gurruchaga al 1800',
      portalTitle: 'Torre Gurruchaga',
      producerUserId: PRODUCER_ID,
      branchId: BRANCH_ID,
    });
    expect(uow.events.published.map((event) => event.type)).toEqual([
      'properties.development_created',
    ]);
    const [entry] = uow.audit.entries;
    expect(entry).toMatchObject({
      action: 'development.created',
      entityType: 'development',
      entityId: output.developmentId,
      clientIds: [CLIENT],
      kind: 'created',
      changes: {
        name: { before: null, after: 'Torre Gurruchaga' },
        privateAddress: { before: null, after: 'Gurruchaga 1834' },
        commercialContactClientId: { before: null, after: CLIENT },
      },
    });
    // Solo lo que se cargó: lo vacío del alta no se registra.
    for (const empty of ['tagIds', 'featureIds', 'description', 'isFinanced']) {
      expect(entry?.changes).not.toHaveProperty(empty);
    }
  });

  it('geocodes the private address when the coordinates are empty', async () => {
    const geocoder = new FakeGeocoder(ok({ latitude: -34.58, longitude: -58.43 }));
    const { uow, create } = setup({ geocoder });
    const { latitude: _lat, longitude: _lng, ...withoutCoordinates } = INPUT;

    const output = unwrap(await create.execute(withoutCoordinates, TEST_DEVELOPER));

    expect(output.geocoding).toBe('found');
    expect(geocoder.requests).toEqual([
      {
        street: 'Gurruchaga 1834',
        streetNumber: undefined,
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'CABA',
      },
    ]);
    expect(uow.developments.rows.get(output.developmentId)?.coordinates).toMatchObject({
      latitude: -34.58,
    });
  });

  it('creates it anyway when the geocoder fails', async () => {
    const { create } = setup({ geocoder: new FakeGeocoder(err({ type: 'GeocodingFailed' })) });
    const { latitude: _lat, longitude: _lng, ...withoutCoordinates } = INPUT;
    expect(unwrap(await create.execute(withoutCoordinates, TEST_DEVELOPER)).geocoding).toBe(
      'failed',
    );
  });

  it('rejects an unknown location, invalid input and a missing numbering', async () => {
    expect(
      unwrapErr(
        await setup().create.execute(
          { ...INPUT, locationId: '00000000-0000-7000-8000-00000000d999' },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'LocationNotFound' });
    expect(
      unwrapErr(await setup().create.execute({ ...INPUT, name: ' ' }, TEST_DEVELOPER)).type,
    ).toBe('InvalidInput');
    const noCodes = setup({ codes: false });
    expect(unwrapErr(await noCodes.create.execute(INPUT, TEST_DEVELOPER))).toEqual({
      type: 'ReferenceCodeUnavailable',
    });
    expect(noCodes.uow.developments.rows.size).toBe(0);
  });

  it('needs developments:create', async () => {
    const { uow, create } = setup();
    expect(unwrapErr(await create.execute(INPUT, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
    expect(uow.audit.entries).toEqual([]);
  });
});

describe('Development edits', () => {
  it('audits only the general fields that changed, with both contacts in client_ids', async () => {
    const { uow, general } = setup();
    withDevelopment(uow, { commercialContactClientId: CLIENT });

    unwrap(
      await general.execute(
        {
          developmentId: DEVELOPMENT_ID,
          name: 'Torre Gurruchaga',
          developmentType: 'building',
          developerName: 'Constructora Sur',
          commercialContactClientId: OTHER_CLIENT,
        },
        TEST_DEVELOPER,
      ),
    );

    expect(stored(uow)).toMatchObject({
      developerName: 'Constructora Sur',
      commercialContactClientId: OTHER_CLIENT,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'development.updated',
        kind: 'updated',
        clientIds: [OTHER_CLIENT, CLIENT],
        changes: {
          developerName: { before: null, after: 'Constructora Sur' },
          commercialContactClientId: { before: CLIENT, after: OTHER_CLIENT },
        },
      }),
    ]);
  });

  it('does not audit an edit that changes nothing', async () => {
    const { uow, general } = setup();
    withDevelopment(uow);
    unwrap(
      await general.execute(
        { developmentId: DEVELOPMENT_ID, name: 'Torre Gurruchaga', developmentType: 'building' },
        TEST_DEVELOPER,
      ),
    );
    expect(uow.audit.entries).toEqual([]);
  });

  it('updates the details and the location, geocoding only when the address moved', async () => {
    const geocoder = new FakeGeocoder(ok({ latitude: -34.6, longitude: -58.4 }));
    const { uow, details, location } = setup({ geocoder });
    withDevelopment(uow);

    unwrap(
      await details.execute(
        {
          developmentId: DEVELOPMENT_ID,
          constructionStatus: 'pre_sale',
          deliveryDate: '2028-03-01',
          description: 'Torre de 12 pisos',
          isFinanced: true,
        },
        TEST_DEVELOPER,
      ),
    );
    const same = unwrap(
      await location.execute(
        {
          developmentId: DEVELOPMENT_ID,
          privateAddress: 'Gurruchaga 1834',
          locationId: NEIGHBORHOOD,
        },
        TEST_DEVELOPER,
      ),
    );
    const moved = unwrap(
      await location.execute(
        {
          developmentId: DEVELOPMENT_ID,
          privateAddress: 'Honduras 5550',
          locationId: NEIGHBORHOOD,
        },
        TEST_DEVELOPER,
      ),
    );

    expect(same.geocoding).toBe('unchanged');
    expect(moved.geocoding).toBe('found');
    expect(geocoder.requests).toHaveLength(1);
    expect(stored(uow)).toMatchObject({
      constructionStatus: 'pre_sale',
      deliveryDate: '2028-03-01',
      deal: { isFinanced: true, acceptsSwap: false },
      privateAddress: 'Honduras 5550',
      publishAddress: 'Honduras al 5500',
    });
    expect(uow.audit.entries.map((entry) => Object.keys(entry.changes ?? {}))).toEqual([
      ['constructionStatus', 'deliveryDate', 'description', 'isFinanced'],
      ['privateAddress', 'publishAddress', 'latitude', 'longitude'],
    ]);
  });

  it('changes the status as an explicit action and rejects editing in the trash', async () => {
    const { uow, status } = setup();
    withDevelopment(uow);

    unwrap(
      await status.execute({ developmentId: DEVELOPMENT_ID, status: 'marketing' }, TEST_DEVELOPER),
    );
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'development.status_changed',
        kind: 'action',
        changes: { status: { before: 'loading', after: 'marketing' } },
      }),
    ]);
    expect(uow.events.published.map((event) => event.type)).toEqual([
      'properties.development_status_changed',
    ]);

    withDevelopment(uow, { deletedAt: TEST_NOW });
    expect(
      unwrapErr(
        await status.execute({ developmentId: DEVELOPMENT_ID, status: 'loading' }, TEST_DEVELOPER),
      ),
    ).toEqual({ type: 'DevelopmentInTrash' });
  });

  it('marks features and tags of the catalog and rejects unknown ones', async () => {
    const { uow, features, tags } = setup();
    withDevelopment(uow);
    uow.features.rows.set(FEATURE, {
      id: unwrap(parseId<'Feature'>(FEATURE)),
      kind: 'amenity',
      key: 'amenity-pileta',
      name: 'Pileta',
      position: 0,
      isActive: true,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    uow.tags.rows.set(TAG, {
      id: unwrap(parseId<'PropertyTag'>(TAG)),
      groupId: undefined,
      name: 'Pozo',
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    unwrap(
      await features.execute(
        { developmentId: DEVELOPMENT_ID, featureIds: [FEATURE] },
        TEST_DEVELOPER,
      ),
    );
    unwrap(await tags.execute({ developmentId: DEVELOPMENT_ID, tagIds: [TAG] }, TEST_DEVELOPER));

    expect(stored(uow)).toMatchObject({ featureIds: [FEATURE], tagIds: [TAG] });
    expect(uow.audit.entries.map((entry) => [entry.action, entry.changes])).toEqual([
      ['development.updated', { featureIds: { before: [], after: [FEATURE] } }],
      ['development.tags_changed', { tagIds: { before: [], after: [TAG] } }],
    ]);
    expect(
      unwrapErr(
        await features.execute(
          { developmentId: DEVELOPMENT_ID, featureIds: [TAG] },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'FeatureNotFound' });
    expect(
      unwrapErr(
        await tags.execute({ developmentId: DEVELOPMENT_ID, tagIds: [FEATURE] }, TEST_DEVELOPER),
      ),
    ).toEqual({ type: 'TagNotFound' });
  });

  it('lets each actor edit their own, their branch or all developments', async () => {
    const { uow, status } = setup();
    const input = { developmentId: DEVELOPMENT_ID, status: 'marketing' } as const;

    withDevelopment(uow, { producerUserId: OTHER_USER_ID, branchId: OTHER_BRANCH });
    expect(unwrapErr(await status.execute(input, TEST_DEVELOPER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await status.execute(input, BRANCH_EDITOR))).toEqual({ type: 'Forbidden' });
    unwrap(await status.execute(input, OTHER_BRANCH_EDITOR));

    withDevelopment(uow, { producerUserId: OTHER_USER_ID, branchId: BRANCH_ID });
    unwrap(await status.execute(input, BRANCH_EDITOR));

    withDevelopment(uow, { producerUserId: OTHER_USER_ID, branchId: OTHER_BRANCH });
    unwrap(await status.execute(input, TEST_DEVELOPMENTS_MANAGER));
    expect(unwrapErr(await status.execute(input, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });

  it('reports a development that does not exist', async () => {
    const { general } = setup();
    expect(
      unwrapErr(
        await general.execute(
          { developmentId: DEVELOPMENT_ID, name: 'Torre', developmentType: 'building' },
          TEST_DEVELOPER,
        ),
      ),
    ).toEqual({ type: 'DevelopmentNotFound' });
  });
});

describe('DeleteDevelopment and RestoreDevelopment', () => {
  it('sends it to the trash and back, auditing both actions', async () => {
    const { uow, remove, restore } = setup();
    withDevelopment(uow);

    unwrap(await remove.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER));
    expect(stored(uow).deletedBy).toBe(OTHER_USER_ID);
    unwrap(await restore.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER));
    expect(stored(uow).deletedAt).toBeUndefined();
    expect(uow.audit.entries.map((entry) => entry.action)).toEqual([
      'development.deleted',
      'development.restored',
    ]);
    expect(
      unwrapErr(
        await restore.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER),
      ),
    ).toEqual({ type: 'DevelopmentNotDeleted' });
  });

  it('cannot delete one with active units; units in the trash do not count', async () => {
    const { uow, remove } = setup();
    withDevelopment(uow);
    const unit = propertySnapshot({ developmentId: DEVELOPMENT_ID });
    uow.properties.rows.set(unit.id, unit);

    expect(
      unwrapErr(await remove.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER)),
    ).toEqual({ type: 'DevelopmentHasUnits', units: 1 });

    uow.properties.rows.set(unit.id, { ...unit, deletedAt: TEST_NOW });
    unwrap(await remove.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPMENTS_MANAGER));
  });

  it('needs developments:delete', async () => {
    const { uow, remove, restore } = setup();
    withDevelopment(uow, { deletedAt: TEST_NOW });
    expect(
      unwrapErr(await remove.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(await restore.execute({ developmentId: DEVELOPMENT_ID }, TEST_DEVELOPER)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('CreateDevelopmentUnit', () => {
  const UNIT: CreateDevelopmentUnitInput = {
    developmentId: DEVELOPMENT_ID,
    propertyType: 'apartment',
    operation: 'sale',
    currency: 'USD',
    price: '150000',
    floor: '4',
    unit: 'A',
    rooms: 3,
    surfaceTotalM2: 80,
    surfaceCoveredM2: 72,
  };

  it('creates a draft property that inherits the development data', async () => {
    const { uow, unit, propertyCodes } = setup();
    const coordinates = unwrap(Coordinates.create(-34.58, -58.43));
    withDevelopment(uow, {
      featureIds: [FEATURE],
      producerUserId: PRODUCER_ID,
      branchId: BRANCH_ID,
      coordinates,
    });

    const output = unwrap(await unit.execute(UNIT, TEST_DEVELOPER));

    expect(propertyCodes.requests).toEqual([
      { kind: 'apartment', producerUserId: PRODUCER_ID, branchId: BRANCH_ID },
    ]);
    expect(uow.properties.rows.get(output.propertyId)).toMatchObject({
      status: 'draft',
      developmentId: DEVELOPMENT_ID,
      address: {
        street: 'Gurruchaga 1834',
        floor: '4',
        unit: 'A',
        neighborhood: 'Palermo',
        city: 'CABA',
        province: 'CABA',
      },
      publishAddress: 'Gurruchaga al 1800',
      locationId: NEIGHBORHOOD,
      coordinates,
      featureIds: [FEATURE],
      characteristics: { rooms: 3, surfaceTotalM2: 80, surfaceCoveredM2: 72 },
      operations: [expect.objectContaining({ priceCents: 15_000_000n })],
      producerUserId: PRODUCER_ID,
    });
    expect(uow.audit.entries.map((entry) => [entry.action, entry.entityType])).toEqual([
      ['property.created', 'property'],
      ['development.unit_added', 'development'],
    ]);
    expect(uow.audit.entries[0]?.changes).toMatchObject({
      developmentId: { before: null, after: DEVELOPMENT_ID },
      rooms: { before: null, after: 3 },
      featureIds: { before: null, after: [FEATURE] },
    });
    expect(uow.audit.entries[0]?.changes).not.toHaveProperty('isFurnished');
    expect(uow.audit.entries[1]?.changes).toEqual({
      unitId: { before: null, after: output.propertyId },
      unitCode: { before: null, after: output.code },
    });
  });

  it('keeps the development producer when a manager adds the unit', async () => {
    const { uow, unit } = setup();
    withDevelopment(uow);
    const output = unwrap(await unit.execute(UNIT, TEST_DEVELOPMENTS_MANAGER));
    expect(uow.properties.rows.get(output.propertyId)?.producerUserId).toBe(PRODUCER_ID);
  });

  it('rejects a development in the trash, a disabled type and covered over total', async () => {
    const trash = setup();
    withDevelopment(trash.uow, { deletedAt: TEST_NOW });
    expect(unwrapErr(await trash.unit.execute(UNIT, TEST_DEVELOPER))).toEqual({
      type: 'DevelopmentInTrash',
    });

    const disabled = setup();
    withDevelopment(disabled.uow);
    disabled.uow.typeSettings.rows.set('apartment', {
      kind: 'apartment',
      isEnabled: false,
      visibleAttributes: [],
    });
    expect(unwrapErr(await disabled.unit.execute(UNIT, TEST_DEVELOPER))).toEqual({
      type: 'PropertyTypeDisabled',
    });

    const surfaces = setup();
    withDevelopment(surfaces.uow);
    expect(
      unwrapErr(
        await surfaces.unit.execute(
          { ...UNIT, surfaceTotalM2: 50, surfaceCoveredM2: 60 },
          TEST_DEVELOPER,
        ),
      ).type,
    ).toBe('CoveredExceedsTotal');
    expect(surfaces.uow.properties.rows.size).toBe(0);
  });

  it('needs properties:create and permission to edit the development', async () => {
    const { uow, unit } = setup();
    withDevelopment(uow, { producerUserId: OTHER_USER_ID, branchId: OTHER_BRANCH });
    expect(unwrapErr(await unit.execute(UNIT, TEST_DEVELOPER))).toEqual({ type: 'Forbidden' });
    const readOnly = Actor.user(PRODUCER_ID, ['developments:update']);
    expect(unwrapErr(await unit.execute(UNIT, readOnly))).toEqual({ type: 'Forbidden' });
    expect(uow.properties.rows.size).toBe(0);
  });
});
