import { describe, expect, it } from 'vitest';

import { unwrap, unwrapErr } from '../../../shared/testing';
import type { ReservationListItem } from '../ports/property-reservations-query';
import {
  CLIENT_ID,
  InMemoryUserNames,
  MANAGER_USER_ID,
  PRODUCER_ID,
  PROPERTY_ID,
  StubPropertyReservationsQuery,
  TEST_OUTSIDER,
  TEST_RESERVING_AGENT,
} from '../../testing';
import { GetActiveReservation } from './get-active-reservation';
import { ListPropertyReservations } from './list-property-reservations';

function aRow(overrides: Partial<ReservationListItem> = {}): ReservationListItem {
  return {
    id: '00000000-0000-7000-8000-0000000000f1',
    propertyId: PROPERTY_ID,
    client: { id: CLIENT_ID, name: 'Lucía Pérez' },
    opportunityId: undefined,
    agentUserId: PRODUCER_ID,
    managerUserId: undefined,
    operation: 'sale',
    amount: undefined,
    commissionPct: undefined,
    commission: undefined,
    status: 'active',
    reservedAt: new Date('2026-09-20T12:00:00Z'),
    estimatedSigningDate: undefined,
    fallenAt: undefined,
    fallenReason: undefined,
    signedAt: undefined,
    notes: undefined,
    ...overrides,
  };
}

const ACTIVE = aRow();
const FALLEN = aRow({
  id: '00000000-0000-7000-8000-0000000000f2',
  status: 'fallen',
  managerUserId: MANAGER_USER_ID,
});
/** El gerente ya no está activo: su nombre no vuelve. */
const users = new InMemoryUserNames(new Map([[PRODUCER_ID, 'Camila Ríos']]));
const AGENT = { id: PRODUCER_ID, name: 'Camila Ríos' };

describe('ListPropertyReservations', () => {
  it('pages the reservations of the property in the database', async () => {
    const reservations = new StubPropertyReservationsQuery([ACTIVE, FALLEN]);
    const page = unwrap(
      await new ListPropertyReservations({ reservations, users }).execute(
        { propertyId: PROPERTY_ID, page: 2, pageSize: 1 },
        TEST_RESERVING_AGENT,
      ),
    );
    const { agentUserId: _agent, managerUserId: _manager, ...fallen } = FALLEN;
    expect(page).toEqual({
      items: [{ ...fallen, agent: AGENT, manager: { id: MANAGER_USER_ID, name: undefined } }],
      total: 2,
      page: 2,
      pageSize: 1,
    });
    expect(reservations.requests).toEqual([
      {
        propertyId: PROPERTY_ID,
        sort: { field: 'reservedAt', direction: 'desc' },
        offset: 1,
        limit: 1,
      },
    ]);
  });

  it('rejects an invalid sort and actors without the permission', async () => {
    const list = new ListPropertyReservations({
      reservations: new StubPropertyReservationsQuery(),
      users,
    });
    expect(
      unwrapErr(
        await list.execute({ propertyId: PROPERTY_ID, sort: 'client' }, TEST_RESERVING_AGENT),
      ),
    ).toMatchObject({ type: 'InvalidInput' });
    expect(unwrapErr(await list.execute({ propertyId: PROPERTY_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('GetActiveReservation', () => {
  it('returns the active reservation, if any', async () => {
    const get = new GetActiveReservation({
      reservations: new StubPropertyReservationsQuery([FALLEN, ACTIVE]),
      users,
    });
    expect(unwrap(await get.execute({ propertyId: PROPERTY_ID }, TEST_RESERVING_AGENT))).toEqual(
      expect.objectContaining({ id: ACTIVE.id, agent: AGENT, manager: undefined }),
    );
    const none = new GetActiveReservation({
      reservations: new StubPropertyReservationsQuery([FALLEN]),
      users,
    });
    expect(
      unwrap(await none.execute({ propertyId: PROPERTY_ID }, TEST_RESERVING_AGENT)),
    ).toBeUndefined();
    expect(unwrapErr(await get.execute({ propertyId: PROPERTY_ID }, TEST_OUTSIDER))).toEqual({
      type: 'Forbidden',
    });
  });
});
