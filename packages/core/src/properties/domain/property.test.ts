import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import { CURRENCIES, OPERATIONS, PROPERTY_STATUS_VALUES, PROPERTY_TYPES } from '../contracts';
import { Coordinates } from './coordinates';
import { propertySlug, suggestPortalTitle, suggestPublishAddress } from './listing-text';
import { Property, type NewProperty } from './property';
import { PRICE_CURRENCIES, PROPERTY_KINDS, PROPERTY_OPERATIONS } from './property-catalog';
import { PROPERTY_STATUSES } from './property-status';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const ID = unwrap(parseId<'Property'>('00000000-0000-7000-8000-0000000000c1'));

function newProperty(overrides: Partial<NewProperty> = {}): NewProperty {
  return {
    id: ID,
    code: 'DEP0001',
    kind: 'apartment',
    operation: {
      operation: 'sale',
      currency: 'USD',
      priceCents: 12_000_000n,
      priceOnRequest: false,
      commissionPct: undefined,
    },
    address: {
      street: '  Gurruchaga ',
      streetNumber: '1834',
      floor: ' ',
      unit: 'B',
      neighborhood: 'Palermo',
      city: 'CABA',
      province: 'Buenos Aires',
    },
    publishAddress: undefined,
    portalTitle: undefined,
    coordinates: undefined,
    locationId: undefined,
    producerUserId: '00000000-0000-7000-8000-0000000000a1',
    branchId: '00000000-0000-7000-8000-0000000000b1',
    now: NOW,
    ...overrides,
  };
}

describe('domain values', () => {
  it('match the values the contracts offer', () => {
    expect([...PROPERTY_OPERATIONS]).toEqual([...OPERATIONS]);
    expect([...PROPERTY_KINDS]).toEqual([...PROPERTY_TYPES]);
    expect([...PRICE_CURRENCIES]).toEqual([...CURRENCIES]);
    expect([...PROPERTY_STATUSES]).toEqual([...PROPERTY_STATUS_VALUES]);
  });
});

describe('suggestPublishAddress', () => {
  it('rounds the street number down to the hundred', () => {
    expect(suggestPublishAddress('Gurruchaga', '1834')).toBe('Gurruchaga al 1800');
    expect(suggestPublishAddress('Gurruchaga', '45')).toBe('Gurruchaga al 0');
  });

  it('keeps only the street without a numeric street number', () => {
    expect(suggestPublishAddress(' Ruta 8 ', undefined)).toBe('Ruta 8');
    expect(suggestPublishAddress('Ruta 8', 'km 50')).toBe('Ruta 8');
  });
});

describe('suggestPortalTitle', () => {
  it('names the kind, the operation and the neighborhood', () => {
    expect(
      suggestPortalTitle({ kind: 'ph', operation: 'temporary_rent', neighborhood: 'Belgrano' }),
    ).toBe('PH en alquiler temporario en Belgrano');
  });

  it('leaves the place out when there is no neighborhood', () => {
    expect(suggestPortalTitle({ kind: 'land', operation: 'sale', neighborhood: ' ' })).toBe(
      'Terreno en venta',
    );
  });
});

describe('propertySlug', () => {
  it('strips accents and symbols and ends with the code', () => {
    expect(propertySlug('Galpón en venta en Ñuñoa!', 'GAL0002')).toBe(
      'galpon-en-venta-en-nunoa-gal0002',
    );
  });
});

describe('Coordinates', () => {
  it('rounds to six decimals', () => {
    const point = unwrap(Coordinates.create(-34.58612345, -58.4321));
    expect(point.latitude).toBe(-34.586123);
    expect(point.longitude).toBe(-58.4321);
  });

  it.each([
    [91, 0],
    [0, -181],
    [Number.NaN, 0],
  ])('rejects %d, %d', (latitude, longitude) => {
    expect(unwrapErr(Coordinates.create(latitude, longitude))).toEqual({
      type: 'InvalidCoordinates',
    });
  });
});

describe('Property.create', () => {
  it('starts as a draft with suggested listing texts and records the event', () => {
    const property = unwrap(Property.create(newProperty()));
    const snapshot = property.toSnapshot();

    expect(snapshot.status).toBe('draft');
    expect(snapshot.address.street).toBe('Gurruchaga');
    expect(snapshot.address.floor).toBeUndefined();
    expect(snapshot.publishAddress).toBe('Gurruchaga al 1800');
    expect(snapshot.portalTitle).toBe('Departamento en venta en Palermo');
    expect(snapshot.slug).toBe('departamento-en-venta-en-palermo-dep0001');
    expect(snapshot.operations).toEqual([
      {
        operation: 'sale',
        currency: 'USD',
        priceCents: 12_000_000n,
        priceOnRequest: false,
        commissionPct: undefined,
      },
    ]);
    expect(property.pullEvents()).toEqual([
      {
        type: 'properties.property_created',
        aggregateId: ID,
        occurredAt: NOW,
        payload: { propertyId: ID, code: 'DEP0001' },
      },
    ]);
  });

  it('keeps the listing texts the user wrote', () => {
    const property = unwrap(
      Property.create(
        newProperty({ publishAddress: ' Palermo Soho ', portalTitle: 'Luminoso 3 ambientes' }),
      ),
    );
    expect(property.toSnapshot().publishAddress).toBe('Palermo Soho');
    expect(property.toSnapshot().portalTitle).toBe('Luminoso 3 ambientes');
  });

  it('rejects a negative price', () => {
    const result = Property.create(
      newProperty({ operation: { operation: 'rent', currency: 'ARS', priceCents: -1n } }),
    );
    expect(unwrapErr(result)).toEqual({ type: 'NegativePrice' });
  });
});

describe('Property trash', () => {
  it('records who deleted it and when, and restores it', () => {
    const property = unwrap(Property.create(newProperty()));
    property.pullEvents();

    unwrap(property.delete('user-1', LATER));
    expect(property.isDeleted).toBe(true);
    expect(property.toSnapshot()).toMatchObject({ deletedAt: LATER, deletedBy: 'user-1' });
    expect(unwrapErr(property.delete('user-1', LATER))).toEqual({
      type: 'PropertyAlreadyDeleted',
    });

    unwrap(property.restoreFromTrash(LATER));
    expect(property.toSnapshot()).toMatchObject({ deletedAt: undefined, deletedBy: undefined });
    expect(unwrapErr(property.restoreFromTrash(LATER))).toEqual({ type: 'PropertyNotDeleted' });
    expect(property.pullEvents().map((e) => e.type)).toEqual([
      'properties.property_deleted',
      'properties.property_restored',
    ]);
  });

  it('exposes its producer and branch for the ownership rules', () => {
    const property = unwrap(Property.create(newProperty()));
    expect(property.ownership).toEqual({
      ownerId: '00000000-0000-7000-8000-0000000000a1',
      ownerBranchId: '00000000-0000-7000-8000-0000000000b1',
    });
  });
});

describe('Property quick edits', () => {
  function created() {
    const property = unwrap(Property.create(newProperty()));
    property.pullEvents();
    return property;
  }

  it('changes the status along a valid transition and records it', () => {
    const property = created();
    expect(unwrap(property.changeStatus('available', LATER))).toBe(true);
    expect(property.toSnapshot()).toMatchObject({ status: 'available', statusChangedAt: LATER });
    expect(unwrap(property.changeStatus('available', LATER))).toBe(false);
    const events = property.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'properties.property_status_changed',
      payload: { from: 'draft', to: 'available' },
    });
  });

  it('rejects an invalid transition, a reservation by hand and edits in the trash', () => {
    const property = created();
    expect(unwrapErr(property.changeStatus('sold', LATER))).toEqual({
      type: 'InvalidStatusTransition',
      from: 'draft',
      to: 'sold',
    });
    expect(unwrapErr(property.changeStatus('reserved', LATER))).toEqual({
      type: 'StatusNotManual',
    });
    unwrap(property.delete('user-1', LATER));
    expect(unwrapErr(property.changeStatus('available', LATER))).toEqual({
      type: 'PropertyInTrash',
    });
    expect(unwrapErr(property.changeTags({ add: ['t'], remove: [] }, LATER))).toEqual({
      type: 'PropertyInTrash',
    });
  });

  it('moves the property to the branch of its new producer', () => {
    const property = created();
    expect(unwrap(property.changeProducer({ userId: 'user-2', branchId: 'branch-2' }, LATER))).toBe(
      true,
    );
    expect(property.ownership).toEqual({ ownerId: 'user-2', ownerBranchId: 'branch-2' });
    expect(unwrap(property.changeProducer({ userId: 'user-2', branchId: 'branch-2' }, LATER))).toBe(
      false,
    );
  });

  it('changes the price of an existing operation and keeps the price history', () => {
    const property = created();
    expect(
      unwrap(
        property.changePrice(
          { operation: 'sale', currency: 'USD', priceCents: 11_500_000n },
          LATER,
        ),
      ),
    ).toBe(true);
    expect(property.toSnapshot().operations).toEqual([
      {
        operation: 'sale',
        currency: 'USD',
        priceCents: 11_500_000n,
        priceOnRequest: false,
        commissionPct: undefined,
      },
    ]);
    expect(property.priceChanges).toEqual([
      {
        operation: 'sale',
        currency: 'USD',
        oldPriceCents: 12_000_000n,
        newPriceCents: 11_500_000n,
        changedAt: LATER,
      },
    ]);
    expect(property.pullEvents().map((e) => e.type)).toEqual(['properties.property_price_changed']);
  });

  it('does not compare prices across currencies and rejects a missing operation', () => {
    const property = created();
    unwrap(
      property.changePrice({ operation: 'sale', currency: 'ARS', priceCents: undefined }, LATER),
    );
    expect(property.priceChanges[0]).toMatchObject({ oldPriceCents: undefined, currency: 'ARS' });
    expect(
      unwrapErr(
        property.changePrice({ operation: 'rent', currency: 'ARS', priceCents: 1n }, LATER),
      ),
    ).toEqual({ type: 'OperationNotFound' });
    expect(
      unwrapErr(
        property.changePrice({ operation: 'sale', currency: 'ARS', priceCents: -1n }, LATER),
      ),
    ).toEqual({ type: 'NegativePrice' });
  });

  it('adds and removes tags without repeats', () => {
    const property = created();
    expect(unwrap(property.changeTags({ add: ['a', 'b', 'a'], remove: [] }, LATER))).toBe(true);
    expect(unwrap(property.changeTags({ add: ['c'], remove: ['a'] }, LATER))).toBe(true);
    expect([...property.tagIds].sort()).toEqual(['b', 'c']);
    expect(unwrap(property.changeTags({ add: ['b'], remove: ['z'] }, LATER))).toBe(false);
  });
});

describe('Property reservations', () => {
  function available() {
    const property = unwrap(Property.create(newProperty()));
    unwrap(property.changeStatus('available', NOW));
    property.pullEvents();
    return property;
  }

  it('is reserved only while available and offering the reserved operation', () => {
    const draft = unwrap(Property.create(newProperty()));
    expect(unwrapErr(draft.markAsReserved('sale', LATER))).toEqual({
      type: 'PropertyNotAvailable',
    });

    const property = available();
    expect(property.offers('rent')).toBe(false);
    expect(unwrapErr(property.markAsReserved('rent', LATER))).toEqual({
      type: 'OperationNotFound',
    });
    unwrap(property.markAsReserved('sale', LATER));
    expect(property.toSnapshot()).toMatchObject({ status: 'reserved', statusChangedAt: LATER });
    expect(property.pullEvents()).toMatchObject([
      {
        type: 'properties.property_status_changed',
        payload: { from: 'available', to: 'reserved' },
      },
    ]);
    expect(unwrapErr(property.markAsReserved('sale', LATER))).toEqual({
      type: 'PropertyNotAvailable',
    });
  });

  it('does not reserve a property in the trash', () => {
    const property = available();
    unwrap(property.delete('user-1', LATER));
    expect(unwrapErr(property.markAsReserved('sale', LATER))).toEqual({
      type: 'PropertyInTrash',
    });
  });

  it('blocks status changes by hand and the trash while reserved', () => {
    const property = available();
    unwrap(property.markAsReserved('sale', LATER));
    for (const status of ['available', 'sold', 'withdrawn'] as const) {
      expect(unwrapErr(property.changeStatus(status, LATER))).toEqual({
        type: 'PropertyReserved',
      });
    }
    expect(unwrapErr(property.delete('user-1', LATER))).toEqual({ type: 'PropertyReserved' });
    expect(property.status).toBe('reserved');
  });

  it('goes back to available when the reservation falls', () => {
    const property = available();
    unwrap(property.markAsReserved('sale', LATER));
    expect(property.releaseReservation(LATER)).toBe(true);
    expect(property.status).toBe('available');
    expect(property.releaseReservation(LATER)).toBe(false);
  });

  it('is sold or rented when the reservation is signed', () => {
    const sale = available();
    unwrap(sale.markAsReserved('sale', LATER));
    expect(sale.closeAsSigned('sale', LATER)).toBe(true);
    expect(sale.status).toBe('sold');
    expect(sale.closeAsSigned('sale', LATER)).toBe(false);

    for (const operation of ['rent', 'temporary_rent'] as const) {
      const rental = unwrap(
        Property.create(
          newProperty({ operation: { operation, currency: 'ARS', priceCents: 80_000_000n } }),
        ),
      );
      unwrap(rental.changeStatus('available', NOW));
      unwrap(rental.markAsReserved(operation, LATER));
      expect(rental.closeAsSigned(operation, LATER)).toBe(true);
      expect(rental.status).toBe('rented');
    }
  });
});
