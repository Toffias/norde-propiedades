import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { unwrap, unwrapErr } from '../../shared/testing';
import { RESERVATION_STATUS_VALUES } from '../contracts';
import { Reservation, type NewReservation } from './reservation';
import { canReservationTransition, RESERVATION_STATUSES } from './reservation-status';

const NOW = new Date('2026-10-01T12:00:00Z');
const LATER = new Date('2026-10-02T12:00:00Z');
const ID = unwrap(parseId<'Reservation'>('00000000-0000-7000-8000-0000000000f1'));
const PROPERTY_ID = unwrap(parseId<'Property'>('00000000-0000-7000-8000-0000000000c1'));
const CLIENT_ID = '00000000-0000-7000-8000-0000000000d1';

function newReservation(overrides: Partial<NewReservation> = {}): NewReservation {
  return {
    id: ID,
    propertyId: PROPERTY_ID,
    clientId: CLIENT_ID,
    opportunityId: undefined,
    operation: 'sale',
    agentUserId: 'agent-1',
    branchId: 'branch-1',
    managerUserId: undefined,
    amount: { cents: 500_000n, currency: 'USD' },
    commissionPct: 3,
    commission: undefined,
    estimatedSigningDate: '2026-11-15',
    notes: '  Seña en efectivo  ',
    now: NOW,
    ...overrides,
  };
}

function active(): Reservation {
  const reservation = unwrap(Reservation.create(newReservation()));
  reservation.pullEvents();
  return reservation;
}

describe('reservation statuses', () => {
  it('match the values the contracts offer', () => {
    expect([...RESERVATION_STATUSES]).toEqual([...RESERVATION_STATUS_VALUES]);
  });

  it('only leave active, to fallen or signed', () => {
    expect(canReservationTransition('active', 'fallen')).toBe(true);
    expect(canReservationTransition('active', 'signed')).toBe(true);
    expect(canReservationTransition('fallen', 'active')).toBe(false);
    expect(canReservationTransition('signed', 'fallen')).toBe(false);
  });
});

describe('Reservation.create', () => {
  it('starts active, trims the notes and records the event', () => {
    const reservation = unwrap(Reservation.create(newReservation()));
    expect(reservation.toSnapshot()).toMatchObject({
      status: 'active',
      reservedAt: NOW,
      notes: 'Seña en efectivo',
      amount: { cents: 500_000n, currency: 'USD' },
      commissionPct: 3,
    });
    expect(reservation.pullEvents()).toEqual([
      {
        type: 'properties.reservation_created',
        aggregateId: ID,
        occurredAt: NOW,
        payload: {
          reservationId: ID,
          propertyId: PROPERTY_ID,
          clientId: CLIENT_ID,
          operation: 'sale',
        },
      },
    ]);
  });

  it('takes the commission as a percentage, an amount or both', () => {
    const both = unwrap(
      Reservation.create(
        newReservation({ commissionPct: 2.5, commission: { cents: 1_250_000n, currency: 'USD' } }),
      ),
    );
    expect(both.toSnapshot()).toMatchObject({
      commissionPct: 2.5,
      commission: { cents: 1_250_000n, currency: 'USD' },
    });
    const none = unwrap(
      Reservation.create(newReservation({ commissionPct: undefined, amount: undefined })),
    );
    expect(none.toSnapshot()).toMatchObject({ commissionPct: undefined, amount: undefined });
  });

  it('can start without a contact', () => {
    const reservation = unwrap(Reservation.create(newReservation({ clientId: undefined })));
    expect(reservation.clientId).toBeUndefined();
    expect(reservation.pullEvents()).toMatchObject([
      { type: 'properties.reservation_created', payload: { clientId: undefined } },
    ]);
  });

  it('needs the contact of its opportunity', () => {
    expect(
      unwrapErr(
        Reservation.create(
          newReservation({
            clientId: undefined,
            opportunityId: '00000000-0000-7000-8000-0000000000e1',
          }),
        ),
      ),
    ).toEqual({ type: 'ReservationOpportunityWithoutClient' });
  });

  it('rejects negative amounts and an invalid commission', () => {
    expect(
      unwrapErr(Reservation.create(newReservation({ amount: { cents: -1n, currency: 'USD' } }))),
    ).toEqual({ type: 'NegativeReservationAmount' });
    expect(
      unwrapErr(
        Reservation.create(newReservation({ commission: { cents: -1n, currency: 'ARS' } })),
      ),
    ).toEqual({ type: 'NegativeReservationAmount' });
    expect(unwrapErr(Reservation.create(newReservation({ commissionPct: 101 })))).toEqual({
      type: 'InvalidCommission',
    });
    expect(unwrapErr(Reservation.create(newReservation({ commissionPct: 1.234 })))).toEqual({
      type: 'InvalidCommission',
    });
  });
});

describe('Reservation changes', () => {
  it('updates the terms of an active reservation, and reports no change', () => {
    const reservation = active();
    const terms = { ...reservation.toSnapshot(), managerUserId: 'manager-1', notes: undefined };
    expect(unwrap(reservation.update(terms, LATER))).toBe(true);
    expect(reservation.toSnapshot()).toMatchObject({
      managerUserId: 'manager-1',
      notes: undefined,
      updatedAt: LATER,
    });
    expect(unwrap(reservation.update(terms, LATER))).toBe(false);
    expect(reservation.pullEvents().map((e) => e.type)).toEqual(['properties.reservation_updated']);
  });

  it('takes the contact later, or another one', () => {
    const reservation = unwrap(Reservation.create(newReservation({ clientId: undefined })));
    reservation.pullEvents();
    const other = '00000000-0000-7000-8000-0000000000d2';

    expect(
      unwrap(reservation.update({ ...reservation.toSnapshot(), clientId: CLIENT_ID }, LATER)),
    ).toBe(true);
    expect(reservation.toSnapshot()).toMatchObject({ clientId: CLIENT_ID, updatedAt: LATER });
    expect(
      unwrap(reservation.update({ ...reservation.toSnapshot(), clientId: other }, LATER)),
    ).toBe(true);
    expect(reservation.clientId).toBe(other);
    expect(reservation.pullEvents()).toMatchObject([
      { type: 'properties.reservation_updated', payload: { clientId: CLIENT_ID } },
      { type: 'properties.reservation_updated', payload: { clientId: other } },
    ]);
  });

  it('keeps the contact of its opportunity', () => {
    const reservation = unwrap(
      Reservation.create(newReservation({ opportunityId: '00000000-0000-7000-8000-0000000000e1' })),
    );
    const terms = reservation.toSnapshot();
    expect(
      unwrapErr(
        reservation.update({ ...terms, clientId: '00000000-0000-7000-8000-0000000000d2' }, LATER),
      ),
    ).toEqual({ type: 'ReservationClientLocked' });
    expect(unwrapErr(reservation.update({ ...terms, clientId: undefined }, LATER))).toEqual({
      type: 'ReservationClientLocked',
    });
    expect(unwrap(reservation.update({ ...terms, notes: 'Firma el lunes' }, LATER))).toBe(true);
  });

  it('falls with an optional reason', () => {
    const reservation = active();
    unwrap(reservation.fall('  El comprador desistió ', LATER));
    expect(reservation.toSnapshot()).toMatchObject({
      status: 'fallen',
      fallenAt: LATER,
      fallenReason: 'El comprador desistió',
    });
    expect(reservation.isActive).toBe(false);
    expect(reservation.pullEvents().map((e) => e.type)).toEqual(['properties.reservation_fallen']);
  });

  it('is signed', () => {
    const reservation = active();
    unwrap(reservation.sign(LATER));
    expect(reservation.toSnapshot()).toMatchObject({ status: 'signed', signedAt: LATER });
    expect(reservation.pullEvents()).toMatchObject([
      { type: 'properties.reservation_signed', payload: { operation: 'sale' } },
    ]);
  });

  it('does not change once fallen or signed', () => {
    const fallen = active();
    unwrap(fallen.fall(undefined, LATER));
    const signed = active();
    unwrap(signed.sign(LATER));
    for (const reservation of [fallen, signed]) {
      expect(unwrapErr(reservation.fall(undefined, LATER))).toEqual({
        type: 'ReservationNotActive',
      });
      expect(unwrapErr(reservation.sign(LATER))).toEqual({ type: 'ReservationNotActive' });
      expect(unwrapErr(reservation.update(reservation.toSnapshot(), LATER))).toEqual({
        type: 'ReservationNotActive',
      });
    }
  });
});
