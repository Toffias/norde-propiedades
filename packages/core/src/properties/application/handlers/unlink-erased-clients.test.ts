import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import {
  CLIENT_ID,
  InMemoryPropertiesUnitOfWork,
  PROPERTY_ID,
  propertySnapshot,
  reservationSnapshot,
  TEST_NOW,
} from '../../testing';
import type { PropertyClientErasure } from '../ports/property-client-erasure';

import { UnlinkErasedClients } from './unlink-erased-clients';

const ACTOR = Actor.system('scheduler', ['properties:erase-client-data']);
const OTHER_CLIENT = '00000000-0000-7000-8000-0000000000d2';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000c2';

class RecordingErasure implements PropertyClientErasure {
  readonly calls: (readonly string[])[] = [];

  unlinkClients(clientIds: readonly string[]) {
    this.calls.push(clientIds);
    return Promise.resolve(3);
  }
}

function setup() {
  const erasure = new RecordingErasure();
  const uow = new InMemoryPropertiesUnitOfWork();
  const useCase = new UnlinkErasedClients({ erasure, uow, clock: new FixedClock(TEST_NOW) });
  return { erasure, uow, useCase };
}

describe('UnlinkErasedClients', () => {
  it('unlinks the erased clients from the properties', async () => {
    const { erasure, useCase } = setup();

    expect(unwrap(await useCase.execute({ clientIds: [CLIENT_ID] }, ACTOR))).toEqual({
      unlinked: 3,
    });
    expect(erasure.calls).toEqual([[CLIENT_ID]]);
  });

  it('deletes their reservations and makes an actively reserved property available', async () => {
    const { uow, useCase } = setup();
    uow.properties.rows.set(PROPERTY_ID, propertySnapshot({ status: 'reserved' }));
    uow.reservations
      .add(reservationSnapshot())
      .add(
        reservationSnapshot({
          id: '00000000-0000-7000-8000-0000000000f2',
          status: 'fallen',
        }),
      )
      .add(
        reservationSnapshot({
          id: '00000000-0000-7000-8000-0000000000f3',
          clientId: OTHER_CLIENT,
          status: 'signed',
        }),
      );

    expect(unwrap(await useCase.execute({ clientIds: [CLIENT_ID] }, ACTOR))).toEqual({
      unlinked: 5,
    });
    expect([...uow.reservations.rows.values()].map((r) => r.clientId)).toEqual([OTHER_CLIENT]);
    expect(uow.properties.rows.get(PROPERTY_ID)?.status).toBe('available');
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.reservation_erased',
        entityId: PROPERTY_ID,
        clientIds: [],
        changes: { status: { before: 'reserved', after: 'available' } },
      }),
    ]);
  });

  it('only deletes the reservation when its property is no longer reserved', async () => {
    const { uow, useCase } = setup();
    uow.properties.rows.set(
      OTHER_PROPERTY,
      propertySnapshot({ id: OTHER_PROPERTY, status: 'sold' }),
    );
    uow.reservations.add(
      reservationSnapshot({ propertyId: propertySnapshot({ id: OTHER_PROPERTY }).id }),
    );

    unwrap(await useCase.execute({ clientIds: [CLIENT_ID] }, ACTOR));
    expect(uow.reservations.rows.size).toBe(0);
    expect(uow.properties.rows.get(OTHER_PROPERTY)?.status).toBe('sold');
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects invalid ids and actors without the permission', async () => {
    const { erasure, useCase } = setup();

    expect(unwrapErr(await useCase.execute({ clientIds: ['x'] }, ACTOR))).toEqual({
      type: 'InvalidInput',
    });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientIds: [CLIENT_ID] },
          Actor.system('scheduler', ['properties:read']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(erasure.calls).toEqual([]);
  });
});
