import { describe, expect, it } from 'vitest';

import { parseId } from '../../shared';
import { NOTIFICATION_TYPE_VALUES } from '../contracts';

import { NOTIFICATION_TYPES, Notification } from './notification';

const T0 = new Date('2026-03-01T10:00:00Z');
const T1 = new Date('2026-03-01T11:00:00Z');
const id = parseId<'Notification'>('00000000-0000-7000-8000-000000000001').unwrapOr(
  undefined as never,
);

function aNotification() {
  return Notification.create({
    id,
    userId: 'user-1',
    type: 'client.assigned',
    entityId: 'client-1',
    clientIds: ['client-1', 'client-1'],
    sourceEventId: 'event-1',
    createdAt: T0,
  });
}

describe('Notification', () => {
  it('is created unread, without repeated clients', () => {
    expect(aNotification().toSnapshot()).toEqual({
      id,
      userId: 'user-1',
      type: 'client.assigned',
      entityId: 'client-1',
      clientIds: ['client-1'],
      sourceEventId: 'event-1',
      createdAt: T0,
      readAt: undefined,
    });
  });

  it('belongs only to whoever receives it', () => {
    const notification = aNotification();

    expect(notification.belongsTo('user-1')).toBe(true);
    expect(notification.belongsTo('user-2')).toBe(false);
  });

  it('is marked read once, keeping the first date', () => {
    const notification = aNotification();

    expect(notification.markRead(T0)).toBe(true);
    expect(notification.markRead(T1)).toBe(false);
    expect(notification.toSnapshot().readAt).toEqual(T0);
  });

  it('has the same types as the contract', () => {
    expect([...NOTIFICATION_TYPES]).toEqual([...NOTIFICATION_TYPE_VALUES]);
  });
});
