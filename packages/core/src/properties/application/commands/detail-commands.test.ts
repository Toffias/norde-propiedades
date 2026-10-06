import { describe, expect, it } from 'vitest';

import { Actor, err, ok, parseId } from '../../../shared';
import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  BRANCH_ID,
  FakeGeocoder,
  InMemoryProducers,
  InMemoryPropertiesUnitOfWork,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
} from '../../testing';
import { ChangePropertyCode } from './change-property-code';
import { ChangePropertyProducer } from './change-property-producer';
import { ChangePropertyStatus } from './change-property-status';
import { ChangePropertyTags } from './change-property-tags';
import { CreateCustomAttribute } from './create-custom-attribute';
import { UpdateCustomAttribute } from './update-custom-attribute';
import { UpdatePropertyCharacteristics } from './update-property-characteristics';
import { UpdatePropertyCustomAttributes } from './update-property-custom-attributes';
import { UpdatePropertyDeal } from './update-property-deal';
import { UpdatePropertyDescription } from './update-property-description';
import { UpdatePropertyFeatures } from './update-property-features';
import { UpdatePropertyInternalInfo } from './update-property-internal-info';
import { UpdatePropertyLocation } from './update-property-location';
import { UpdatePropertyOperations } from './update-property-operations';
import { UpdatePropertyPublication } from './update-property-publication';

/** Agente que edita su cartera: no publica, no cambia el captador ni marca disponible. */
const EDITOR = Actor.user(PRODUCER_ID, ['properties:read', 'properties:update'])
  .withBranch(BRANCH_ID)
  .withCorrelation('req-2');
/** Edita las de su sucursal. */
const BRANCH_EDITOR = Actor.user('00000000-0000-7000-8000-0000000000a4', [
  'properties:update',
  'properties:update-branch',
]).withBranch(BRANCH_ID);
/** Administra Mi empresa. */
const ADMIN = Actor.user(OTHER_USER_ID, ['properties:*', 'settings:update']);
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000c2';
const TAG = '00000000-0000-7000-8000-0000000000e1';
const FEATURE = '00000000-0000-7000-8000-0000000000f1';
const ATTRIBUTE = '00000000-0000-7000-8000-0000000000f9';

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  uow.properties.rows.set(PROPERTY_ID, propertySnapshot());
  uow.properties.rows.set(
    OTHER_PROPERTY,
    propertySnapshot({
      id: OTHER_PROPERTY,
      code: 'CAS0002',
      producerUserId: OTHER_USER_ID,
      branchId: '00000000-0000-7000-8000-0000000000b2',
    }),
  );
  const clock = new FixedClock(TEST_NOW);
  const producers = new InMemoryProducers(
    new Map([
      [OTHER_USER_ID, { branchId: '00000000-0000-7000-8000-0000000000b2' }],
      [PRODUCER_ID, { branchId: BRANCH_ID }],
    ]),
  );
  return { uow, clock, producers };
}

function stored(uow: InMemoryPropertiesUnitOfWork, id = PROPERTY_ID) {
  const row = uow.properties.rows.get(id);
  if (!row) throw new Error('missing fixture');
  return row;
}

describe('UpdatePropertyCharacteristics', () => {
  it('saves the characteristics and audits only what changed', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyCharacteristics({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, rooms: 3, surfaceTotalM2: 80, surfaceCoveredM2: 72.5 },
      EDITOR,
    );
    unwrap(result);
    expect(stored(uow).characteristics).toMatchObject({
      rooms: 3,
      surfaceTotalM2: 80,
      surfaceCoveredM2: 72.5,
    });
    expect(uow.audit.entries).toEqual([
      {
        actorId: PRODUCER_ID,
        source: 'gestion',
        correlationId: 'req-2',
        action: 'property.updated',
        entityType: 'property',
        entityId: PROPERTY_ID,
        clientIds: [],
        kind: 'updated',
        changes: {
          rooms: { before: null, after: 3 },
          surfaceTotalM2: { before: null, after: 80 },
          surfaceCoveredM2: { before: null, after: 72.5 },
        },
      },
    ]);
    expect(uow.properties.savedBy.get(PROPERTY_ID)).toBe(PRODUCER_ID);
  });

  it('does not audit an edit without changes', async () => {
    const { uow, clock } = setup();
    unwrap(
      await new UpdatePropertyCharacteristics({ uow, clock }).execute(
        { propertyId: PROPERTY_ID },
        EDITOR,
      ),
    );
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects a covered surface larger than the total', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyCharacteristics({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, surfaceTotalM2: 40, surfaceCoveredM2: 50 },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({ type: 'CoveredExceedsTotal' });
    expect(uow.audit.entries).toEqual([]);
  });

  it('checks who can edit the property', async () => {
    const { uow, clock } = setup();
    const command = new UpdatePropertyCharacteristics({ uow, clock });
    // Sin permiso de edición.
    expect(
      unwrapErr(await command.execute({ propertyId: PROPERTY_ID, rooms: 2 }, TEST_OUTSIDER)),
    ).toEqual({
      type: 'Forbidden',
    });
    // "Editar de otros": la de otro captador, de otra sucursal.
    expect(
      unwrapErr(await command.execute({ propertyId: OTHER_PROPERTY, rooms: 2 }, EDITOR)),
    ).toEqual({
      type: 'Forbidden',
    });
    // Con el permiso de su sucursal, edita las de la sucursal pero no las de otras.
    unwrap(await command.execute({ propertyId: PROPERTY_ID, rooms: 2 }, BRANCH_EDITOR));
    expect(
      unwrapErr(await command.execute({ propertyId: OTHER_PROPERTY, rooms: 2 }, BRANCH_EDITOR)),
    ).toEqual({ type: 'Forbidden' });
    // Con "editar todas", cualquiera.
    unwrap(await command.execute({ propertyId: OTHER_PROPERTY, rooms: 2 }, TEST_MANAGER));
  });

  it('reports a missing property and an invalid input', async () => {
    const { uow, clock } = setup();
    const command = new UpdatePropertyCharacteristics({ uow, clock });
    expect(
      unwrapErr(
        await command.execute({ propertyId: '00000000-0000-7000-8000-0000000000ff' }, EDITOR),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
    expect(unwrapErr(await command.execute({ propertyId: 'x' }, EDITOR)).type).toBe('InvalidInput');
  });

  it('does not edit a property in the trash', async () => {
    const { uow, clock } = setup();
    uow.properties.rows.set(
      PROPERTY_ID,
      propertySnapshot({ deletedAt: TEST_NOW, deletedBy: PRODUCER_ID }),
    );
    const result = await new UpdatePropertyCharacteristics({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, rooms: 2 },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({ type: 'PropertyInTrash' });
  });
});

describe('UpdatePropertyOperations', () => {
  it('adds an operation, keeps the price history and emits PropertyPriceChanged', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyOperations({ uow, clock }).execute(
      {
        propertyId: PROPERTY_ID,
        operations: [
          { operation: 'sale', currency: 'USD', price: '115000', commissionPct: '3' },
          { operation: 'rent', currency: 'ARS', priceOnRequest: true },
        ],
      },
      EDITOR,
    );
    unwrap(result);
    expect(stored(uow).operations).toEqual([
      {
        operation: 'sale',
        currency: 'USD',
        priceCents: 11_500_000n,
        priceOnRequest: false,
        commissionPct: 3,
      },
      {
        operation: 'rent',
        currency: 'ARS',
        priceCents: undefined,
        priceOnRequest: true,
        commissionPct: undefined,
      },
    ]);
    expect(uow.properties.priceChanges.map((p) => p.change)).toEqual([
      {
        operation: 'sale',
        currency: 'USD',
        oldPriceCents: 12_000_000n,
        newPriceCents: 11_500_000n,
        changedAt: TEST_NOW,
      },
    ]);
    expect(uow.events.published).toMatchObject([
      {
        type: 'properties.property_price_changed',
        payload: { propertyId: PROPERTY_ID, operation: 'sale', currency: 'USD' },
      },
      { type: 'properties.property_changed', payload: { propertyId: PROPERTY_ID } },
    ]);
    const [entry] = uow.audit.entries;
    expect(entry?.action).toBe('property.updated');
    expect(entry?.changes?.operations?.before).toEqual([
      {
        operation: 'sale',
        currency: 'USD',
        priceCents: 12_000_000n,
        priceOnRequest: false,
        commissionPct: null,
      },
    ]);
  });

  it('rejects a commission out of range', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyOperations({ uow, clock }).execute(
      {
        propertyId: PROPERTY_ID,
        operations: [{ operation: 'sale', currency: 'USD', commissionPct: '120' }],
      },
      EDITOR,
    );
    expect(unwrapErr(result).type).toBe('InvalidInput');
  });

  it('requires at least one operation', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyOperations({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, operations: [] },
      EDITOR,
    );
    expect(unwrapErr(result).type).toBe('InvalidInput');
    expect(uow.events.published).toEqual([]);
  });
});

describe('ChangePropertyStatus', () => {
  it('changes the status, emits PropertyStatusChanged and audits the action', async () => {
    const { uow, clock } = setup();
    unwrap(
      await new ChangePropertyStatus({ uow, clock }).execute(
        { propertyId: PROPERTY_ID, status: 'available' },
        TEST_MANAGER,
      ),
    );
    expect(stored(uow).status).toBe('available');
    expect(uow.events.published).toMatchObject([
      {
        type: 'properties.property_status_changed',
        payload: { propertyId: PROPERTY_ID, from: 'draft', to: 'available' },
      },
      { type: 'properties.property_changed', payload: { propertyId: PROPERTY_ID } },
    ]);
    expect(uow.audit.entries[0]).toMatchObject({
      kind: 'action',
      action: 'property.status_changed',
      changes: { status: { before: 'draft', after: 'available' } },
    });
  });

  it('requires "marcar disponible" to mark it available', async () => {
    const { uow, clock } = setup();
    const command = new ChangePropertyStatus({ uow, clock });
    expect(
      unwrapErr(await command.execute({ propertyId: PROPERTY_ID, status: 'available' }, EDITOR)),
    ).toEqual({ type: 'Forbidden' });
    unwrap(await command.execute({ propertyId: PROPERTY_ID, status: 'withdrawn' }, EDITOR));
  });

  it('rejects an invalid transition', async () => {
    const { uow, clock } = setup();
    const result = await new ChangePropertyStatus({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, status: 'sold' },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({
      type: 'InvalidStatusTransition',
      from: 'draft',
      to: 'sold',
    });
  });
});

describe('ChangePropertyCode', () => {
  it('changes the code', async () => {
    const { uow, clock } = setup();
    unwrap(
      await new ChangePropertyCode({ uow, clock }).execute(
        { propertyId: PROPERTY_ID, code: 'dep-0100' },
        EDITOR,
      ),
    );
    expect(stored(uow).code).toBe('DEP-0100');
    expect(uow.audit.entries[0]?.changes).toEqual({
      code: { before: 'DEP0001', after: 'DEP-0100' },
    });
  });

  it('rejects a code taken by another property', async () => {
    const { uow, clock } = setup();
    const result = await new ChangePropertyCode({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, code: 'cas0002' },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({ type: 'ReferenceCodeTaken' });
  });
});

describe('UpdatePropertyLocation', () => {
  const location = {
    propertyId: PROPERTY_ID,
    street: 'Honduras',
    streetNumber: '5120',
    neighborhood: 'Palermo',
    city: 'CABA',
    province: 'Buenos Aires',
  };

  it('geocodes again when the address changes without coordinates', async () => {
    const { uow, clock } = setup();
    const geocoder = new FakeGeocoder(ok({ latitude: -34.58, longitude: -58.43 }));
    const result = await new UpdatePropertyLocation({ uow, clock, geocoder }).execute(
      location,
      EDITOR,
    );
    expect(unwrap(result)).toEqual({ geocoding: 'found' });
    expect(geocoder.requests).toHaveLength(1);
    expect(stored(uow)).toMatchObject({
      publishAddress: 'Honduras al 5100',
      coordinates: { latitude: -34.58, longitude: -58.43 },
    });
  });

  it('keeps the coordinates when the geocoder fails', async () => {
    const { uow, clock } = setup();
    const geocoder = new FakeGeocoder(err({ type: 'GeocodingFailed' }));
    const result = await new UpdatePropertyLocation({ uow, clock, geocoder }).execute(
      location,
      EDITOR,
    );
    expect(unwrap(result)).toEqual({ geocoding: 'failed' });
    expect(stored(uow).address.street).toBe('Honduras');
  });

  it('does not geocode when only the publish address changes', async () => {
    const { uow, clock } = setup();
    const geocoder = new FakeGeocoder();
    const result = await new UpdatePropertyLocation({ uow, clock, geocoder }).execute(
      {
        ...location,
        street: 'Gurruchaga',
        streetNumber: '1834',
        floor: '3',
        unit: 'B',
        publishAddress: 'Palermo Soho',
      },
      EDITOR,
    );
    expect(unwrap(result)).toEqual({ geocoding: 'unchanged' });
    expect(geocoder.requests).toEqual([]);
    expect(uow.audit.entries[0]?.changes).toEqual({
      publishAddress: { before: 'Gurruchaga al 1800', after: 'Palermo Soho' },
    });
  });

  it('rejects an unknown location of the catalog', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyLocation({
      uow,
      clock,
      geocoder: new FakeGeocoder(),
    }).execute({ ...location, locationId: '00000000-0000-7000-8000-00000000d0ff' }, EDITOR);
    expect(unwrapErr(result)).toEqual({ type: 'LocationNotFound' });
  });
});

describe('UpdatePropertyDeal and UpdatePropertyDescription', () => {
  it('saves the deal attributes and the expenses in cents', async () => {
    const { uow, clock } = setup();
    unwrap(
      await new UpdatePropertyDeal({ uow, clock }).execute(
        { propertyId: PROPERTY_ID, isExclusive: true, creditEligible: true, expenses: '85000' },
        EDITOR,
      ),
    );
    expect(stored(uow).deal).toMatchObject({
      isExclusive: true,
      creditEligible: true,
      expensesCents: 8_500_000n,
    });
    expect(uow.audit.entries[0]?.changes).toEqual({
      isExclusive: { before: false, after: true },
      creditEligible: { before: false, after: true },
      expensesCents: { before: null, after: 8_500_000n },
    });
  });

  it('saves the description and the portal title', async () => {
    const { uow, clock } = setup();
    unwrap(
      await new UpdatePropertyDescription({ uow, clock }).execute(
        { propertyId: PROPERTY_ID, portalTitle: 'Luminoso 3 ambientes', description: 'Al frente.' },
        EDITOR,
      ),
    );
    expect(stored(uow)).toMatchObject({
      portalTitle: 'Luminoso 3 ambientes',
      description: 'Al frente.',
    });
  });
});

describe('UpdatePropertyFeatures and ChangePropertyTags', () => {
  it('marks features of the catalog and rejects unknown ones', async () => {
    const { uow, clock } = setup();
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
    const command = new UpdatePropertyFeatures({ uow, clock });
    unwrap(await command.execute({ propertyId: PROPERTY_ID, featureIds: [FEATURE] }, EDITOR));
    expect(stored(uow).featureIds).toEqual([FEATURE]);
    expect(
      unwrapErr(await command.execute({ propertyId: PROPERTY_ID, featureIds: [TAG] }, EDITOR)),
    ).toEqual({ type: 'FeatureNotFound' });
  });

  it('replaces the tags and audits the action', async () => {
    const { uow, clock } = setup();
    uow.tags.rows.set(TAG, {
      id: unwrap(parseId<'PropertyTag'>(TAG)),
      groupId: undefined,
      name: 'Oportunidad',
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const command = new ChangePropertyTags({ uow, clock });
    unwrap(await command.execute({ propertyId: PROPERTY_ID, tagIds: [TAG] }, EDITOR));
    unwrap(await command.execute({ propertyId: PROPERTY_ID, tagIds: [] }, EDITOR));
    expect(stored(uow).tagIds).toEqual([]);
    expect(uow.audit.entries.map((entry) => [entry.action, entry.changes])).toEqual([
      ['property.tags_changed', { tagIds: { before: [], after: [TAG] } }],
      ['property.tags_changed', { tagIds: { before: [TAG], after: [] } }],
    ]);
    expect(
      unwrapErr(await command.execute({ propertyId: PROPERTY_ID, tagIds: [FEATURE] }, EDITOR)),
    ).toEqual({ type: 'TagNotFound' });
  });
});

describe('UpdatePropertyCustomAttributes', () => {
  it('validates the values against the definitions of Mi empresa', async () => {
    const { uow, clock } = setup();
    const ids = new SequentialIdGenerator();
    const created = unwrap(
      await new CreateCustomAttribute({ uow, clock, ids }).execute(
        { name: 'Vista', kind: 'select', options: ['Al río', 'A la ciudad'] },
        ADMIN,
      ),
    );
    const command = new UpdatePropertyCustomAttributes({ uow, clock });
    unwrap(
      await command.execute(
        {
          propertyId: PROPERTY_ID,
          values: [{ attributeId: created.attributeId, value: 'Al río' }],
        },
        EDITOR,
      ),
    );
    expect(stored(uow).customAttributes).toEqual([
      { attributeId: created.attributeId, value: 'Al río' },
    ]);
    expect(
      unwrapErr(
        await command.execute(
          {
            propertyId: PROPERTY_ID,
            values: [{ attributeId: created.attributeId, value: 'Al mar' }],
          },
          EDITOR,
        ),
      ),
    ).toEqual({ type: 'InvalidCustomAttributeValue', attributeId: created.attributeId });
    expect(
      unwrapErr(
        await command.execute(
          { propertyId: PROPERTY_ID, values: [{ attributeId: ATTRIBUTE, value: 'x' }] },
          EDITOR,
        ),
      ),
    ).toEqual({ type: 'CustomAttributeNotFound', attributeId: ATTRIBUTE });
  });
});

describe('Custom attributes of Mi empresa', () => {
  it('creates, renames and deactivates an attribute, with its audit entries', async () => {
    const { uow, clock } = setup();
    const ids = new SequentialIdGenerator();
    const { attributeId } = unwrap(
      await new CreateCustomAttribute({ uow, clock, ids }).execute(
        { name: 'Apto mascotas', kind: 'boolean' },
        ADMIN,
      ),
    );
    unwrap(
      await new UpdateCustomAttribute({ uow, clock }).execute(
        { attributeId, name: 'Acepta mascotas', isActive: false },
        ADMIN,
      ),
    );
    expect(uow.audit.entries.map((entry) => [entry.action, entry.kind])).toEqual([
      ['custom_attribute.created', 'created'],
      ['custom_attribute.updated', 'updated'],
    ]);
    expect(uow.audit.entries[1]?.changes).toEqual({
      name: { before: 'Apto mascotas', after: 'Acepta mascotas' },
      isActive: { before: true, after: false },
    });
  });

  it('requires options for a select, a unique name and the settings permission', async () => {
    const { uow, clock } = setup();
    const ids = new SequentialIdGenerator();
    const create = new CreateCustomAttribute({ uow, clock, ids });
    expect(unwrapErr(await create.execute({ name: 'Vista', kind: 'select' }, ADMIN)).type).toBe(
      'InvalidInput',
    );
    unwrap(await create.execute({ name: 'Vista', kind: 'text' }, ADMIN));
    expect(unwrapErr(await create.execute({ name: 'vista', kind: 'text' }, ADMIN))).toEqual({
      type: 'CustomAttributeNameTaken',
    });
    expect(unwrapErr(await create.execute({ name: 'Otro', kind: 'text' }, EDITOR))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('ChangePropertyProducer', () => {
  it('moves the property to the new producer and their branch', async () => {
    const { uow, clock, producers } = setup();
    unwrap(
      await new ChangePropertyProducer({ uow, clock, producers }).execute(
        { propertyId: PROPERTY_ID, userId: OTHER_USER_ID },
        TEST_MANAGER,
      ),
    );
    expect(stored(uow)).toMatchObject({
      producerUserId: OTHER_USER_ID,
      branchId: '00000000-0000-7000-8000-0000000000b2',
    });
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.producer_changed',
      changes: { producerUserId: { before: PRODUCER_ID, after: OTHER_USER_ID } },
    });
  });

  it('requires "cambiar productor" and an active producer', async () => {
    const { uow, clock, producers } = setup();
    const command = new ChangePropertyProducer({ uow, clock, producers });
    expect(
      unwrapErr(await command.execute({ propertyId: PROPERTY_ID, userId: OTHER_USER_ID }, EDITOR)),
    ).toEqual({ type: 'Forbidden' });
    expect(
      unwrapErr(
        await command.execute(
          { propertyId: PROPERTY_ID, userId: '00000000-0000-7000-8000-0000000000aa' },
          TEST_MANAGER,
        ),
      ),
    ).toEqual({ type: 'ProducerNotFound' });
  });
});

describe('UpdatePropertyInternalInfo', () => {
  it('saves appraisers, maintenance and the internal texts', async () => {
    const { uow, clock, producers } = setup();
    unwrap(
      await new UpdatePropertyInternalInfo({ uow, clock, producers }).execute(
        {
          propertyId: PROPERTY_ID,
          appraiserUserIds: [OTHER_USER_ID],
          maintenanceUserId: PRODUCER_ID,
          keysLocation: 'Portería',
        },
        EDITOR,
      ),
    );
    expect(stored(uow).internal).toEqual({
      appraiserUserIds: [OTHER_USER_ID],
      maintenanceUserId: PRODUCER_ID,
      keysLocation: 'Portería',
      legalInfo: undefined,
      internalComments: undefined,
    });
  });

  it('rejects inactive users', async () => {
    const { uow, clock, producers } = setup();
    const result = await new UpdatePropertyInternalInfo({ uow, clock, producers }).execute(
      { propertyId: PROPERTY_ID, appraiserUserIds: ['00000000-0000-7000-8000-0000000000aa'] },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({ type: 'UserNotFound' });
  });
});

describe('UpdatePropertyPublication', () => {
  it('publishes on the web without price and audits the action', async () => {
    const { uow, clock } = setup();
    unwrap(
      await new UpdatePropertyPublication({ uow, clock }).execute(
        { propertyId: PROPERTY_ID, publishedOnWeb: true, showPriceOnWeb: false },
        TEST_MANAGER,
      ),
    );
    expect(stored(uow).publication).toEqual({
      publishedOnWeb: true,
      showPriceOnWeb: false,
      featured: false,
      showExactAddress: false,
    });
    expect(uow.audit.entries[0]).toMatchObject({
      action: 'property.publication_changed',
      changes: {
        publishedOnWeb: { before: false, after: true },
        showPriceOnWeb: { before: true, after: false },
      },
    });
  });

  it('requires the publish permission', async () => {
    const { uow, clock } = setup();
    const result = await new UpdatePropertyPublication({ uow, clock }).execute(
      { propertyId: PROPERTY_ID, featured: true },
      EDITOR,
    );
    expect(unwrapErr(result)).toEqual({ type: 'Forbidden' });
  });
});
