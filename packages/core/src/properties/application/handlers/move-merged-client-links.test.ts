import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { unwrap, unwrapErr } from '../../../shared/testing';
import {
  CLIENT_ID,
  DEVELOPMENT_ID,
  InMemoryPropertiesUnitOfWork,
  PROPERTY_ID,
} from '../../testing';

import { MoveMergedClientLinks } from './move-merged-client-links';

const ACTOR = Actor.system('scheduler', ['properties:merge-client-data']);
const DUPLICATE_ID = '00000000-0000-7000-8000-0000000000d2';

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  return { uow, useCase: new MoveMergedClientLinks({ uow }) };
}

describe('MoveMergedClientLinks', () => {
  it('moves the links of the duplicate to the primary and records it in each history', async () => {
    const { uow, useCase } = setup();
    uow.clientMerge.moved = { propertyIds: [PROPERTY_ID], developmentIds: [DEVELOPMENT_ID] };

    const moved = unwrap(
      await useCase.execute({ clientId: CLIENT_ID, mergedClientId: DUPLICATE_ID }, ACTOR),
    );

    expect(moved).toEqual({ propertyIds: [PROPERTY_ID], developmentIds: [DEVELOPMENT_ID] });
    expect(uow.clientMerge.moves).toEqual([{ from: DUPLICATE_ID, to: CLIENT_ID }]);
    const changes = { clientId: { before: DUPLICATE_ID, after: CLIENT_ID } };
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.client_merged',
        entityType: 'property',
        entityId: PROPERTY_ID,
        clientIds: [CLIENT_ID, DUPLICATE_ID],
        changes,
      }),
      expect.objectContaining({
        action: 'development.client_merged',
        entityType: 'development',
        entityId: DEVELOPMENT_ID,
        clientIds: [CLIENT_ID, DUPLICATE_ID],
        changes,
      }),
    ]);
  });

  it('records nothing when the duplicate had no links', async () => {
    const { uow, useCase } = setup();
    unwrap(await useCase.execute({ clientId: CLIENT_ID, mergedClientId: DUPLICATE_ID }, ACTOR));
    expect(uow.audit.entries).toEqual([]);
  });

  it('rejects an invalid input and actors without the permission', async () => {
    const { uow, useCase } = setup();
    expect(
      unwrapErr(await useCase.execute({ clientId: CLIENT_ID, mergedClientId: CLIENT_ID }, ACTOR)),
    ).toEqual({ type: 'InvalidInput' });
    expect(
      unwrapErr(
        await useCase.execute(
          { clientId: CLIENT_ID, mergedClientId: DUPLICATE_ID },
          Actor.system('scheduler', ['properties:erase-client-data']),
        ),
      ),
    ).toEqual({ type: 'Forbidden' });
    expect(uow.clientMerge.moves).toEqual([]);
  });
});
