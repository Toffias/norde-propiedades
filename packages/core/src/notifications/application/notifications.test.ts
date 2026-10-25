import { describe, expect, it } from 'vitest';

import { Actor, parseId } from '../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../shared/testing';
import { Notification, type NotificationType } from '../domain/notification';
import {
  CLIENT_ID,
  InMemoryNotifications,
  OTHER_CLIENT_ID,
  OTHER_USER_ID,
  TEST_SCHEDULER,
  TEST_USER,
  USER_ID,
} from '../testing';

import { MarkAllNotificationsRead } from './commands/mark-all-notifications-read';
import { MarkNotificationRead } from './commands/mark-notification-read';
import { MoveMergedClientNotifications } from './handlers/move-merged-client-notifications';
import { RemoveErasedClientNotifications } from './handlers/remove-erased-client-notifications';
import { CountUnreadNotifications } from './queries/count-unread-notifications';
import { ListNotifications } from './queries/list-notifications';

const NOW = '2026-03-02T09:00:00.000Z';
const WITHOUT_PERMISSION = Actor.user(USER_ID, ['clients:read']);

function idOf(n: number) {
  return parseId<'Notification'>(`00000000-0000-7000-8000-${String(n).padStart(12, '0')}`).unwrapOr(
    undefined as never,
  );
}

async function seed(
  notifications: InMemoryNotifications,
  n: number,
  overrides: {
    readonly userId?: string;
    readonly type?: NotificationType;
    readonly entityId?: string;
    readonly clientId?: string;
  } = {},
) {
  const clientId = overrides.clientId ?? CLIENT_ID;
  await notifications.add(
    Notification.create({
      id: idOf(n),
      userId: overrides.userId ?? USER_ID,
      type: overrides.type ?? 'client.assigned',
      entityId: overrides.entityId ?? clientId,
      clientIds: [clientId],
      sourceEventId: `00000000-0000-7000-8000-0000000e${String(n).padStart(4, '0')}`,
      createdAt: new Date(Date.UTC(2026, 2, 1, n)),
    }),
  );
  return idOf(n);
}

function setup() {
  const notifications = new InMemoryNotifications(new Map([[CLIENT_ID, 'Ana Pérez']]));
  const clock = new FixedClock(NOW);
  return {
    notifications,
    list: new ListNotifications({ notifications }),
    count: new CountUnreadNotifications({ notifications }),
    markRead: new MarkNotificationRead({ notifications, clock }),
    markAllRead: new MarkAllNotificationsRead({ notifications, clock }),
    erase: new RemoveErasedClientNotifications({ notifications }),
    merge: new MoveMergedClientNotifications({ notifications }),
  };
}

describe('ListNotifications', () => {
  it('lists only the ones of whoever asks, newest first, with the unread count', async () => {
    const { notifications, list } = setup();
    await seed(notifications, 1);
    const newest = await seed(notifications, 2, { type: 'opportunity.assigned' });
    await seed(notifications, 3, { userId: OTHER_USER_ID });

    const page = unwrap(await list.execute({ pageSize: 1 }, TEST_USER));

    expect(page).toEqual({
      items: [
        {
          id: newest,
          type: 'opportunity.assigned',
          entityId: CLIENT_ID,
          client: { id: CLIENT_ID, name: 'Ana Pérez' },
          read: false,
          createdAt: new Date(Date.UTC(2026, 2, 1, 2)),
        },
      ],
      total: 2,
      page: 1,
      pageSize: 1,
      unread: 2,
    });
  });

  it('rejects a page larger than the maximum', async () => {
    const { list } = setup();

    expect(unwrapErr(await list.execute({ pageSize: 500 }, TEST_USER))).toEqual({
      type: 'InvalidInput',
    });
  });

  it('requires a user with notifications:read', async () => {
    const { list } = setup();

    expect(unwrapErr(await list.execute({}, WITHOUT_PERMISSION))).toEqual({ type: 'Forbidden' });
    expect(unwrapErr(await list.execute({}, TEST_SCHEDULER))).toEqual({ type: 'Forbidden' });
  });
});

describe('CountUnreadNotifications', () => {
  it('counts the unread ones of whoever asks', async () => {
    const { notifications, count, markRead } = setup();
    const first = await seed(notifications, 1);
    await seed(notifications, 2);
    await seed(notifications, 3, { userId: OTHER_USER_ID });
    unwrap(await markRead.execute({ notificationId: first }, TEST_USER));

    expect(unwrap(await count.execute(TEST_USER))).toEqual({ unread: 1 });
  });

  it('requires a user with notifications:read', async () => {
    const { count } = setup();

    expect(unwrapErr(await count.execute(WITHOUT_PERMISSION))).toEqual({ type: 'Forbidden' });
  });
});

describe('MarkNotificationRead', () => {
  it('marks it read with the current time', async () => {
    const { notifications, markRead } = setup();
    const id = await seed(notifications, 1);

    unwrap(await markRead.execute({ notificationId: id }, TEST_USER));

    expect(notifications.rows.get(id)?.readAt).toEqual(new Date(NOW));
  });

  it('does not find the notification of another user', async () => {
    const { notifications, markRead } = setup();
    const id = await seed(notifications, 1, { userId: OTHER_USER_ID });

    expect(unwrapErr(await markRead.execute({ notificationId: id }, TEST_USER))).toEqual({
      type: 'NotificationNotFound',
    });
    expect(notifications.rows.get(id)?.readAt).toBeUndefined();
  });

  it('reports a missing notification and an invalid ID', async () => {
    const { markRead } = setup();

    expect(unwrapErr(await markRead.execute({ notificationId: idOf(9) }, TEST_USER))).toEqual({
      type: 'NotificationNotFound',
    });
    expect(unwrapErr(await markRead.execute({ notificationId: 'nope' }, TEST_USER))).toEqual({
      type: 'InvalidInput',
    });
  });

  it('requires a user with notifications:read', async () => {
    const { notifications, markRead } = setup();
    const id = await seed(notifications, 1);

    expect(unwrapErr(await markRead.execute({ notificationId: id }, WITHOUT_PERMISSION))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('MarkAllNotificationsRead', () => {
  it('marks the unread ones of whoever asks', async () => {
    const { notifications, markAllRead } = setup();
    await seed(notifications, 1);
    await seed(notifications, 2);
    const others = await seed(notifications, 3, { userId: OTHER_USER_ID });

    expect(unwrap(await markAllRead.execute(TEST_USER))).toEqual({ marked: 2 });
    expect(unwrap(await markAllRead.execute(TEST_USER))).toEqual({ marked: 0 });
    expect(notifications.rows.get(others)?.readAt).toBeUndefined();
  });

  it('requires a user with notifications:read', async () => {
    const { markAllRead } = setup();

    expect(unwrapErr(await markAllRead.execute(WITHOUT_PERMISSION))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('RemoveErasedClientNotifications', () => {
  it('deletes the ones about the erased client, once', async () => {
    const { notifications, erase } = setup();
    await seed(notifications, 1);
    const kept = await seed(notifications, 2, { clientId: OTHER_CLIENT_ID });

    expect(unwrap(await erase.execute({ clientIds: [CLIENT_ID] }, TEST_SCHEDULER))).toEqual({
      removed: 1,
    });
    expect(unwrap(await erase.execute({ clientIds: [CLIENT_ID] }, TEST_SCHEDULER))).toEqual({
      removed: 0,
    });
    expect([...notifications.rows.keys()]).toEqual([kept]);
  });

  it('rejects an empty list and requires notifications:erase-client-data', async () => {
    const { erase } = setup();

    expect(unwrapErr(await erase.execute({ clientIds: [] }, TEST_SCHEDULER))).toEqual({
      type: 'InvalidInput',
    });
    expect(unwrapErr(await erase.execute({ clientIds: [CLIENT_ID] }, TEST_USER))).toEqual({
      type: 'Forbidden',
    });
  });
});

describe('MoveMergedClientNotifications', () => {
  it('moves the ones of the duplicate to the contact that stays', async () => {
    const { notifications, merge } = setup();
    const assigned = await seed(notifications, 1, { clientId: OTHER_CLIENT_ID });
    const opportunity = await seed(notifications, 2, {
      clientId: OTHER_CLIENT_ID,
      type: 'opportunity.assigned',
      entityId: '00000000-0000-7000-8000-0000000000d1',
    });

    const input = { clientId: CLIENT_ID, mergedClientId: OTHER_CLIENT_ID };
    expect(unwrap(await merge.execute(input, TEST_SCHEDULER))).toEqual({ moved: 2 });
    expect(unwrap(await merge.execute(input, TEST_SCHEDULER))).toEqual({ moved: 0 });

    expect(notifications.rows.get(assigned)).toMatchObject({
      entityId: CLIENT_ID,
      clientIds: [CLIENT_ID],
    });
    expect(notifications.rows.get(opportunity)).toMatchObject({
      entityId: '00000000-0000-7000-8000-0000000000d1',
      clientIds: [CLIENT_ID],
    });
  });

  it('rejects merging a contact with itself and requires notifications:merge-client-data', async () => {
    const { merge } = setup();

    expect(
      unwrapErr(
        await merge.execute({ clientId: CLIENT_ID, mergedClientId: CLIENT_ID }, TEST_SCHEDULER),
      ),
    ).toEqual({ type: 'InvalidInput' });
    expect(
      unwrapErr(
        await merge.execute({ clientId: CLIENT_ID, mergedClientId: OTHER_CLIENT_ID }, TEST_USER),
      ),
    ).toEqual({ type: 'Forbidden' });
  });
});
