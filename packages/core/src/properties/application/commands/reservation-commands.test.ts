import { describe, expect, it } from 'vitest';

import { FixedClock, SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import {
  BRANCH_ID,
  CLIENT_ID,
  InMemoryPropertiesUnitOfWork,
  InMemoryProducers,
  MANAGER_USER_ID,
  OTHER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  propertySnapshot,
  RESERVATION_ID,
  reservationSnapshot,
  TEST_MANAGER,
  TEST_NOW,
  TEST_OUTSIDER,
  TEST_RESERVATIONS_MANAGER,
  TEST_RESERVING_AGENT,
} from '../../testing';
import { ChangePropertyStatus } from './change-property-status';
import { DeleteProperty } from './delete-property';
import { FallReservation } from './fall-reservation';
import { ReserveProperty } from './reserve-property';
import { SignReservation } from './sign-reservation';
import { UpdateReservation } from './update-reservation';

const OPPORTUNITY_ID = '00000000-0000-7000-8000-0000000000e9';
const INACTIVE_USER = '00000000-0000-7000-8000-0000000000a9';
const OTHER_BRANCH = '00000000-0000-7000-8000-0000000000b2';
const FIRST_ID = '00000000-0000-7000-8000-000000000001';

function setup(status: 'available' | 'reserved' | 'draft' = 'available') {
  const uow = new InMemoryPropertiesUnitOfWork();
  const property = propertySnapshot({ status });
  uow.properties.rows.set(property.id, property);
  const producers = new InMemoryProducers(
    new Map([
      [PRODUCER_ID, { branchId: BRANCH_ID }],
      [OTHER_USER_ID, { branchId: OTHER_BRANCH }],
      [MANAGER_USER_ID, { branchId: undefined }],
    ]),
  );
  const clock = new FixedClock(TEST_NOW);
  const reserve = new ReserveProperty({ uow, producers, clock, ids: new SequentialIdGenerator() });
  const statusOf = () => uow.properties.rows.get(PROPERTY_ID)?.status;
  return { uow, producers, clock, reserve, statusOf };
}

/** Una propiedad reservada con su reserva activa. */
function reserved() {
  const context = setup('reserved');
  const reservation = reservationSnapshot();
  context.uow.reservations.rows.set(reservation.id, reservation);
  const stored = () => context.uow.reservations.rows.get(RESERVATION_ID);
  return { ...context, stored };
}

const INPUT = {
  propertyId: PROPERTY_ID,
  clientId: CLIENT_ID,
  operation: 'sale' as const,
  amount: '5000',
  currency: 'USD' as const,
  commissionPct: '3',
  estimatedSigningDate: '2026-11-15',
};

describe('ReserveProperty', () => {
  it('reserves an available property and records it in its history', async () => {
    const { uow, reserve, statusOf } = setup();
    const { reservationId } = unwrap(
      await reserve.execute({ ...INPUT, managerUserId: MANAGER_USER_ID }, TEST_RESERVING_AGENT),
    );

    expect(reservationId).toBe(FIRST_ID);
    expect(statusOf()).toBe('reserved');
    expect(uow.reservations.rows.get(FIRST_ID)).toMatchObject({
      propertyId: PROPERTY_ID,
      clientId: CLIENT_ID,
      status: 'active',
      agentUserId: PRODUCER_ID,
      branchId: BRANCH_ID,
      managerUserId: MANAGER_USER_ID,
      amount: { cents: 500_000n, currency: 'USD' },
      commissionPct: 3,
      estimatedSigningDate: '2026-11-15',
      reservedAt: TEST_NOW,
    });
    expect(uow.reservations.savedBy.get(FIRST_ID)).toBe(PRODUCER_ID);
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'properties.property_status_changed',
      'properties.property_changed',
      'properties.reservation_created',
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.reserved',
        entityType: 'property',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT_ID],
        actorId: PRODUCER_ID,
        changes: {
          status: { before: 'available', after: 'reserved' },
          reservationId: { before: null, after: FIRST_ID },
          clientId: { before: null, after: CLIENT_ID },
          reservationOperation: { before: null, after: 'sale' },
          reservationStatus: { before: null, after: 'active' },
          agentUserId: { before: null, after: PRODUCER_ID },
          managerUserId: { before: null, after: MANAGER_USER_ID },
          reservationBranchId: { before: null, after: BRANCH_ID },
          amountCents: { before: null, after: 500_000n },
          amountCurrency: { before: null, after: 'USD' },
          commissionPct: { before: null, after: 3 },
          estimatedSigningDate: { before: null, after: '2026-11-15' },
        },
      }),
    ]);
  });

  it('keeps the opportunity of a featured property and takes another agent with its branch', async () => {
    const { uow, reserve } = setup();
    unwrap(
      await reserve.execute(
        { ...INPUT, opportunityId: OPPORTUNITY_ID, agentUserId: OTHER_USER_ID },
        TEST_RESERVING_AGENT,
      ),
    );
    expect(uow.reservations.rows.get(FIRST_ID)).toMatchObject({
      opportunityId: OPPORTUNITY_ID,
      agentUserId: OTHER_USER_ID,
      branchId: OTHER_BRANCH,
    });
  });

  it('rejects a property that is not available or does not offer the operation', async () => {
    const draft = setup('draft');
    expect(unwrapErr(await draft.reserve.execute(INPUT, TEST_RESERVING_AGENT))).toEqual({
      type: 'PropertyNotAvailable',
    });
    const { reserve, uow } = setup();
    expect(
      unwrapErr(await reserve.execute({ ...INPUT, operation: 'rent' }, TEST_RESERVING_AGENT)),
    ).toEqual({ type: 'OperationNotFound' });
    expect(uow.reservations.rows.size).toBe(0);
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects a second active reservation and rolls back the property', async () => {
    const { uow, reserve, statusOf } = setup();
    uow.reservations.rows.set(RESERVATION_ID, reservationSnapshot());

    expect(unwrapErr(await reserve.execute(INPUT, TEST_RESERVING_AGENT))).toEqual({
      type: 'PropertyAlreadyReserved',
    });
    expect(statusOf()).toBe('available');
    expect(uow.reservations.rows.size).toBe(1);
    expect(uow.events.published).toEqual([]);
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects unknown properties, inactive users and invalid input', async () => {
    const { reserve } = setup();
    expect(
      unwrapErr(
        await reserve.execute(
          { ...INPUT, propertyId: '00000000-0000-7000-8000-0000000000c9' },
          TEST_RESERVING_AGENT,
        ),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
    expect(
      unwrapErr(
        await reserve.execute({ ...INPUT, agentUserId: INACTIVE_USER }, TEST_RESERVING_AGENT),
      ),
    ).toEqual({ type: 'AgentNotFound' });
    expect(
      unwrapErr(
        await reserve.execute({ ...INPUT, managerUserId: INACTIVE_USER }, TEST_RESERVING_AGENT),
      ),
    ).toEqual({ type: 'ManagerNotFound' });
    expect(
      unwrapErr(await reserve.execute({ ...INPUT, currency: undefined }, TEST_RESERVING_AGENT)),
    ).toMatchObject({ type: 'InvalidInput', issues: ['Elegí la moneda del valor.'] });
    expect(
      unwrapErr(
        await reserve.execute(
          { ...INPUT, commissionAmount: '100', commissionCurrency: undefined },
          TEST_RESERVING_AGENT,
        ),
      ),
    ).toMatchObject({ type: 'InvalidInput', issues: ['Elegí la moneda de la comisión.'] });
  });

  it('needs the permission to create reservations', async () => {
    const { reserve } = setup();
    expect(unwrapErr(await reserve.execute(INPUT, TEST_MANAGER))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await reserve.execute(INPUT, TEST_OUTSIDER))).toEqual({ type: 'Forbidden' });
  });
});

describe('UpdateReservation', () => {
  it('changes the terms and records only what changed', async () => {
    const { uow, producers, clock, stored } = reserved();
    const update = new UpdateReservation({ uow, producers, clock });
    unwrap(
      await update.execute(
        {
          reservationId: RESERVATION_ID,
          agentUserId: PRODUCER_ID,
          managerUserId: MANAGER_USER_ID,
          amount: '6000',
          currency: 'USD',
          commissionPct: '3',
          estimatedSigningDate: '2026-11-15',
        },
        TEST_RESERVATIONS_MANAGER,
      ),
    );

    expect(stored()).toMatchObject({
      managerUserId: MANAGER_USER_ID,
      amount: { cents: 600_000n, currency: 'USD' },
      updatedAt: TEST_NOW,
    });
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.reservation_updated',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT_ID],
        changes: {
          managerUserId: { before: null, after: MANAGER_USER_ID },
          amountCents: { before: 500_000n, after: 600_000n },
        },
      }),
    ]);
  });

  it('moves the reservation to the branch of a new agent and keeps an unchanged one', async () => {
    const { uow, clock, stored } = reserved();
    // El agente actual ya no está activo: sin cambiarlo, la reserva igual se edita.
    const producers = new InMemoryProducers(new Map([[OTHER_USER_ID, { branchId: OTHER_BRANCH }]]));
    const update = new UpdateReservation({ uow, producers, clock });
    unwrap(
      await update.execute(
        { reservationId: RESERVATION_ID, notes: 'Firma en escribanía' },
        TEST_RESERVATIONS_MANAGER,
      ),
    );
    expect(stored()).toMatchObject({ agentUserId: PRODUCER_ID, branchId: BRANCH_ID });

    unwrap(
      await update.execute(
        { reservationId: RESERVATION_ID, agentUserId: OTHER_USER_ID },
        TEST_RESERVATIONS_MANAGER,
      ),
    );
    expect(stored()).toMatchObject({ agentUserId: OTHER_USER_ID, branchId: OTHER_BRANCH });
  });

  it('records nothing when nothing changed', async () => {
    const { uow, producers, clock } = reserved();
    const update = new UpdateReservation({ uow, producers, clock });
    unwrap(
      await update.execute(
        {
          reservationId: RESERVATION_ID,
          amount: '5000',
          currency: 'USD',
          commissionPct: '3',
          estimatedSigningDate: '2026-11-15',
        },
        TEST_RESERVATIONS_MANAGER,
      ),
    );
    expect(uow.audit.entries).toEqual([]);
    expect(uow.reservations.savedBy.size).toBe(0);
  });

  it('rejects closed or unknown reservations and actors without the permission', async () => {
    const { uow, producers, clock } = reserved();
    const update = new UpdateReservation({ uow, producers, clock });
    uow.reservations.rows.set(RESERVATION_ID, reservationSnapshot({ status: 'fallen' }));
    expect(
      unwrapErr(await update.execute({ reservationId: RESERVATION_ID }, TEST_RESERVATIONS_MANAGER)),
    ).toEqual({ type: 'ReservationNotActive' });
    expect(
      unwrapErr(
        await update.execute(
          { reservationId: '00000000-0000-7000-8000-0000000000f9' },
          TEST_RESERVATIONS_MANAGER,
        ),
      ),
    ).toEqual({ type: 'ReservationNotFound' });
    expect(
      unwrapErr(await update.execute({ reservationId: RESERVATION_ID }, TEST_RESERVING_AGENT)),
    ).toEqual({ type: 'Forbidden' });
  });
});

describe('FallReservation', () => {
  it('drops the reservation and makes the property available again', async () => {
    const { uow, clock, stored, statusOf } = reserved();
    unwrap(
      await new FallReservation({ uow, clock }).execute(
        { reservationId: RESERVATION_ID, reason: 'El comprador desistió' },
        TEST_RESERVATIONS_MANAGER,
      ),
    );

    expect(stored()).toMatchObject({
      status: 'fallen',
      fallenAt: TEST_NOW,
      fallenReason: 'El comprador desistió',
    });
    expect(statusOf()).toBe('available');
    expect(uow.events.published.map((e) => e.type)).toEqual([
      'properties.reservation_fallen',
      'properties.property_status_changed',
      'properties.property_changed',
    ]);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.reservation_fallen',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT_ID],
        changes: {
          status: { before: 'reserved', after: 'available' },
          reservationStatus: { before: 'active', after: 'fallen' },
          fallenReason: { before: null, after: 'El comprador desistió' },
        },
      }),
    ]);
  });

  it('rejects a reservation that already fell, and an agent', async () => {
    const { uow, clock } = reserved();
    const fall = new FallReservation({ uow, clock });
    expect(
      unwrapErr(await fall.execute({ reservationId: RESERVATION_ID }, TEST_RESERVING_AGENT)),
    ).toEqual({ type: 'Forbidden' });
    unwrap(await fall.execute({ reservationId: RESERVATION_ID }, TEST_RESERVATIONS_MANAGER));
    expect(
      unwrapErr(await fall.execute({ reservationId: RESERVATION_ID }, TEST_RESERVATIONS_MANAGER)),
    ).toEqual({ type: 'ReservationNotActive' });
    expect(uow.audit.entries).toHaveLength(1);
  });
});

describe('SignReservation', () => {
  it('signs a sale and the property is sold', async () => {
    const { uow, clock, stored, statusOf } = reserved();
    unwrap(
      await new SignReservation({ uow, clock }).execute(
        { reservationId: RESERVATION_ID },
        TEST_RESERVATIONS_MANAGER,
      ),
    );

    expect(stored()).toMatchObject({ status: 'signed', signedAt: TEST_NOW });
    expect(statusOf()).toBe('sold');
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.reservation_signed',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT_ID],
        changes: {
          status: { before: 'reserved', after: 'sold' },
          reservationStatus: { before: 'active', after: 'signed' },
        },
      }),
    ]);
  });

  it('signs a rental and the property is rented', async () => {
    const { uow, clock, statusOf } = reserved();
    const rental = propertySnapshot({
      status: 'reserved',
      operations: [
        {
          operation: 'rent',
          currency: 'ARS',
          priceCents: 80_000_000n,
          priceOnRequest: false,
          commissionPct: undefined,
        },
      ],
    });
    uow.properties.rows.set(rental.id, rental);
    uow.reservations.rows.set(RESERVATION_ID, reservationSnapshot({ operation: 'rent' }));
    unwrap(
      await new SignReservation({ uow, clock }).execute(
        { reservationId: RESERVATION_ID },
        TEST_RESERVATIONS_MANAGER,
      ),
    );
    expect(statusOf()).toBe('rented');
  });

  it('rejects a signed reservation and an agent', async () => {
    const { uow, clock } = reserved();
    const sign = new SignReservation({ uow, clock });
    expect(
      unwrapErr(await sign.execute({ reservationId: RESERVATION_ID }, TEST_RESERVING_AGENT)),
    ).toEqual({ type: 'Forbidden' });
    unwrap(await sign.execute({ reservationId: RESERVATION_ID }, TEST_RESERVATIONS_MANAGER));
    expect(
      unwrapErr(await sign.execute({ reservationId: RESERVATION_ID }, TEST_RESERVATIONS_MANAGER)),
    ).toEqual({ type: 'ReservationNotActive' });
  });
});

describe('a reserved property', () => {
  it('does not change its status by hand nor go to the trash', async () => {
    const { uow, clock, statusOf } = reserved();
    expect(
      unwrapErr(
        await new ChangePropertyStatus({ uow, clock }).execute(
          { propertyId: PROPERTY_ID, status: 'available' },
          TEST_MANAGER,
        ),
      ),
    ).toEqual({ type: 'PropertyReserved' });
    expect(
      unwrapErr(
        await new DeleteProperty({ uow, clock }).execute({ propertyId: PROPERTY_ID }, TEST_MANAGER),
      ),
    ).toEqual({ type: 'PropertyReserved' });
    expect(statusOf()).toBe('reserved');
    expect(uow.audit.entries).toEqual([]);
  });
});
