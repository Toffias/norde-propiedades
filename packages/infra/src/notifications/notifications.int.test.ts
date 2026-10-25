import { Notification, type NotificationType } from '@norde/core/notifications';
import { parseId } from '@norde/core/shared';
import { describe, expect, it } from 'vitest';

import { useTestDatabase } from '../../test/database';
import { clients } from '../db/schema';

import { DrizzleNotifications } from './drizzle-notifications';

const db = useTestDatabase();
const repo = new DrizzleNotifications(db);
const USER = '00000000-0000-7000-8000-0000000000a1';
const OTHER = '00000000-0000-7000-8000-0000000000a2';
const ANA = '00000000-0000-7000-8000-0000000000c1';
const BETO = '00000000-0000-7000-8000-0000000000c2';
const UNNAMED = '00000000-0000-7000-8000-0000000000c3';
const OPPORTUNITY = '00000000-0000-7000-8000-0000000000d1';
const T0 = Date.UTC(2026, 9, 1, 12);
const stamps = {
  createdAt: new Date(T0),
  updatedAt: new Date(T0),
  createdBy: 'system:import',
  updatedBy: 'system:import',
};

function uuid(prefix: string, n: number): string {
  return `00000000-0000-7000-8000-${prefix}${String(n).padStart(12 - prefix.length, '0')}`;
}

function aNotification(
  n: number,
  overrides: {
    readonly userId?: string;
    readonly type?: NotificationType;
    readonly entityId?: string;
    readonly clientIds?: readonly string[];
    readonly sourceEventId?: string;
    readonly minutes?: number;
  } = {},
): Notification {
  const clientIds = overrides.clientIds ?? [ANA];
  return Notification.create({
    id: parseId<'Notification'>(uuid('', n)).unwrapOr(undefined as never),
    userId: overrides.userId ?? USER,
    type: overrides.type ?? 'client.assigned',
    entityId: overrides.entityId ?? clientIds[0] ?? ANA,
    clientIds,
    sourceEventId: overrides.sourceEventId ?? uuid('e', n),
    createdAt: new Date(T0 + (overrides.minutes ?? n) * 60_000),
  });
}

async function seedClients() {
  await db.insert(clients).values([
    { id: ANA, name: 'Ana Pérez', ...stamps },
    { id: BETO, name: 'Beto Gómez', ...stamps },
    { id: UNNAMED, name: null, ...stamps },
  ]);
}

describe('DrizzleNotifications', () => {
  it('adds a notification once per event and user', async () => {
    expect(await repo.add(aNotification(1))).toBe(true);
    expect(await repo.add(aNotification(2, { sourceEventId: uuid('e', 1) }))).toBe(false);
    expect(await repo.add(aNotification(3, { sourceEventId: uuid('e', 1), userId: OTHER }))).toBe(
      true,
    );

    const found = await repo.findById(aNotification(1).id);
    expect(found?.toSnapshot()).toEqual(aNotification(1).toSnapshot());
    expect(await repo.findById(aNotification(2).id)).toBeUndefined();
  });

  it('lists the ones of a user with the current name of the contact, page by page', async () => {
    await seedClients();
    for (let n = 1; n <= 5; n += 1) await repo.add(aNotification(n));
    await repo.add(aNotification(6, { clientIds: [UNNAMED] }));
    await repo.add(aNotification(7, { clientIds: ['00000000-0000-7000-8000-0000000000c9'] }));
    await repo.add(aNotification(8, { userId: OTHER }));

    const first = await repo.list(USER, { direction: 'desc', offset: 0, limit: 3 });
    const second = await repo.list(USER, { direction: 'desc', offset: 3, limit: 3 });
    const third = await repo.list(USER, { direction: 'desc', offset: 6, limit: 3 });

    expect(first.total).toBe(7);
    const ids = [...first.items, ...second.items, ...third.items].map((row) => row.id);
    expect(ids).toEqual([7, 6, 5, 4, 3, 2, 1].map((n) => uuid('', n)));
    expect(first.items[0]?.client).toBeUndefined();
    expect(first.items[1]?.client).toEqual({ id: UNNAMED, name: undefined });
    expect(first.items[2]).toEqual({
      id: uuid('', 5),
      type: 'client.assigned',
      entityId: ANA,
      client: { id: ANA, name: 'Ana Pérez' },
      read: false,
      createdAt: new Date(T0 + 5 * 60_000),
    });

    const oldest = await repo.list(USER, { direction: 'asc', offset: 0, limit: 1 });
    expect(oldest.items.map((row) => row.id)).toEqual([uuid('', 1)]);
  });

  it('orders notifications of the same moment by ID, without repeating them across pages', async () => {
    for (let n = 1; n <= 4; n += 1) await repo.add(aNotification(n, { minutes: 0 }));

    const first = await repo.list(USER, { direction: 'desc', offset: 0, limit: 2 });
    const second = await repo.list(USER, { direction: 'desc', offset: 2, limit: 2 });

    expect([...first.items, ...second.items].map((row) => row.id)).toEqual(
      [4, 3, 2, 1].map((n) => uuid('', n)),
    );
  });

  it('marks one or all as read and counts the unread ones per user', async () => {
    await repo.add(aNotification(1));
    await repo.add(aNotification(2));
    await repo.add(aNotification(3));
    await repo.add(aNotification(4, { userId: OTHER }));
    const readAt = new Date(T0 + 3_600_000);

    const one = await repo.findById(aNotification(1).id);
    one?.markRead(readAt);
    if (one) await repo.save(one);
    expect(await repo.countUnread(USER)).toBe(2);
    expect((await repo.findById(aNotification(1).id))?.toSnapshot().readAt).toEqual(readAt);

    expect(await repo.markAllRead(USER, readAt)).toBe(2);
    expect(await repo.markAllRead(USER, readAt)).toBe(0);
    expect(await repo.countUnread(USER)).toBe(0);
    expect(await repo.countUnread(OTHER)).toBe(1);
    const listed = await repo.list(USER, { direction: 'desc', offset: 0, limit: 10 });
    expect(listed.items.every((row) => row.read)).toBe(true);
  });

  it('deletes the ones about erased clients', async () => {
    await repo.add(aNotification(1, { clientIds: [ANA] }));
    await repo.add(aNotification(2, { clientIds: [BETO, ANA] }));
    await repo.add(aNotification(3, { clientIds: [BETO] }));

    expect(await repo.removeClients([ANA])).toBe(2);
    expect(await repo.removeClients([ANA])).toBe(0);
    expect(await repo.removeClients([])).toBe(0);

    const left = await repo.list(USER, { direction: 'desc', offset: 0, limit: 10 });
    expect(left.items.map((row) => row.id)).toEqual([uuid('', 3)]);
  });

  it('moves the ones of a merged duplicate to the contact that stays, keeping the main one first', async () => {
    await repo.add(aNotification(1, { clientIds: [BETO] }));
    await repo.add(
      aNotification(2, { type: 'opportunity.assigned', entityId: OPPORTUNITY, clientIds: [BETO] }),
    );
    await repo.add(aNotification(3, { clientIds: [ANA, BETO] }));
    await repo.add(aNotification(4, { clientIds: [UNNAMED] }));

    expect(await repo.moveClient(BETO, ANA)).toBe(3);
    expect(await repo.moveClient(BETO, ANA)).toBe(0);

    const snapshot = async (n: number) => (await repo.findById(aNotification(n).id))?.toSnapshot();
    expect(await snapshot(1)).toMatchObject({ entityId: ANA, clientIds: [ANA] });
    expect(await snapshot(2)).toMatchObject({ entityId: OPPORTUNITY, clientIds: [ANA] });
    expect(await snapshot(3)).toMatchObject({ entityId: ANA, clientIds: [ANA] });
    expect(await snapshot(4)).toMatchObject({ entityId: UNNAMED, clientIds: [UNNAMED] });
  });
});
