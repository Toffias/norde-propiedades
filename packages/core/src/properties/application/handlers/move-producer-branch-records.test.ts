import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { FixedClock } from '../../../shared/testing';
import {
  BRANCH_ID,
  developmentSnapshot,
  InMemoryPropertiesUnitOfWork,
  OTHER_USER_ID,
  PRODUCER_ID,
  propertySnapshot,
} from '../../testing';

import { MoveProducerBranchRecords } from './move-producer-branch-records';

const NOW = new Date('2026-11-14T12:00:00Z');
const NEW_BRANCH_ID = '00000000-0000-7000-8000-0000000000b9';
const OTHER_PROPERTY = '00000000-0000-7000-8000-0000000000c2';
const scheduler = Actor.system('scheduler', ['properties:move-user-branch']);
const INPUT = { userId: PRODUCER_ID, fromBranchId: BRANCH_ID, toBranchId: NEW_BRANCH_ID };

function setup() {
  const uow = new InMemoryPropertiesUnitOfWork();
  const mine = propertySnapshot({ producerUserId: PRODUCER_ID, branchId: BRANCH_ID });
  const theirs = propertySnapshot({
    id: OTHER_PROPERTY,
    code: 'DEP0002',
    producerUserId: OTHER_USER_ID,
    branchId: BRANCH_ID,
  });
  const development = developmentSnapshot({ producerUserId: PRODUCER_ID, branchId: BRANCH_ID });
  uow.properties.rows.set(mine.id, mine);
  uow.properties.rows.set(theirs.id, theirs);
  uow.developments.rows.set(development.id, development);
  const handler = new MoveProducerBranchRecords({ uow, clock: new FixedClock(NOW) });
  return { uow, handler, mine, theirs, development };
}

describe('MoveProducerBranchRecords', () => {
  it('moves the producer properties and developments still in the old branch, auditing each', async () => {
    const { uow, handler, mine, theirs, development } = setup();

    const result = await handler.execute(INPUT, scheduler);

    expect(result.isOk() && result.value).toEqual({ properties: 1, developments: 1 });
    expect(uow.properties.rows.get(mine.id)?.branchId).toBe(NEW_BRANCH_ID);
    expect(uow.properties.rows.get(theirs.id)?.branchId).toBe(BRANCH_ID);
    expect(uow.developments.rows.get(development.id)?.branchId).toBe(NEW_BRANCH_ID);
    expect(uow.audit.entries).toEqual([
      expect.objectContaining({
        action: 'property.branch_changed',
        entityType: 'property',
        entityId: mine.id,
        changes: { branchId: { before: BRANCH_ID, after: NEW_BRANCH_ID } },
      }),
      expect.objectContaining({
        action: 'development.branch_changed',
        entityType: 'development',
        entityId: development.id,
      }),
    ]);

    const again = await handler.execute(INPUT, scheduler);
    expect(again.isOk() && again.value).toEqual({ properties: 0, developments: 0 });
  });

  it('needs its permission', async () => {
    const { handler } = setup();

    const result = await handler.execute(INPUT, Actor.system('scheduler', ['properties:read']));

    expect(result.isErr() && result.error).toEqual({ type: 'Forbidden' });
  });
});
