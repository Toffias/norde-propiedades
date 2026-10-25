import { describe, expect, it } from 'vitest';

import { Actor } from '../../../shared';
import { SequentialIdGenerator, unwrap, unwrapErr } from '../../../shared/testing';
import type { NotifyAssignmentInput } from '../../contracts';
import {
  CLIENT_ID,
  InMemoryNotifications,
  OTHER_USER_ID,
  TEST_SCHEDULER,
  USER_ID,
} from '../../testing';

import { NotifyAssignment } from './notify-assignment';

const EVENT_ID = '00000000-0000-7000-8000-0000000000e1';
const OPPORTUNITY_ID = '00000000-0000-7000-8000-0000000000d1';
const OCCURRED_AT = new Date('2026-03-01T10:00:00Z');

function setup() {
  const notifications = new InMemoryNotifications();
  const notify = new NotifyAssignment({ notifications, ids: new SequentialIdGenerator() });
  return { notifications, notify };
}

const reassigned: NotifyAssignmentInput = {
  sourceEventId: EVENT_ID,
  type: 'opportunity.assigned',
  entityId: OPPORTUNITY_ID,
  clientId: CLIENT_ID,
  fromAgentId: OTHER_USER_ID,
  toAgentId: USER_ID,
  assignedBy: 'manager-1',
  occurredAt: OCCURRED_AT,
};

describe('NotifyAssignment', () => {
  it('notifies the new agent, about the opportunity and its client', async () => {
    const { notifications, notify } = setup();

    expect(unwrap(await notify.execute(reassigned, TEST_SCHEDULER))).toEqual({ notified: true });

    expect([...notifications.rows.values()]).toEqual([
      {
        id: '00000000-0000-7000-8000-000000000001',
        userId: USER_ID,
        type: 'opportunity.assigned',
        entityId: OPPORTUNITY_ID,
        clientIds: [CLIENT_ID],
        sourceEventId: EVENT_ID,
        createdAt: OCCURRED_AT,
        readAt: undefined,
      },
    ]);
  });

  it('notifies once when the same event arrives twice', async () => {
    const { notifications, notify } = setup();

    unwrap(await notify.execute(reassigned, TEST_SCHEDULER));
    const again = unwrap(await notify.execute(reassigned, TEST_SCHEDULER));

    expect(again).toEqual({ notified: false });
    expect(notifications.rows.size).toBe(1);
  });

  it('does not notify whoever assigned it to themselves', async () => {
    const { notifications, notify } = setup();

    const result = unwrap(
      await notify.execute({ ...reassigned, assignedBy: USER_ID }, TEST_SCHEDULER),
    );

    expect(result).toEqual({ notified: false });
    expect(notifications.rows.size).toBe(0);
  });

  it('does not notify a reassignment caused by an inquiry', async () => {
    const { notifications, notify } = setup();

    unwrap(await notify.execute({ ...reassigned, inquiryId: 'inquiry-1' }, TEST_SCHEDULER));

    expect(notifications.rows.size).toBe(0);
  });

  it('rejects an input that is not an assignment', async () => {
    const { notify } = setup();

    const error = unwrapErr(
      await notify.execute({ ...reassigned, sourceEventId: 'not-a-uuid' }, TEST_SCHEDULER),
    );

    expect(error).toEqual({ type: 'InvalidInput' });
  });

  it('requires notifications:create', async () => {
    const { notify } = setup();

    const error = unwrapErr(
      await notify.execute(reassigned, Actor.system('scheduler', ['notifications:read'])),
    );

    expect(error).toEqual({ type: 'Forbidden' });
  });
});
