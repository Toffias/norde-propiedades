// Fakes en memoria del módulo notifications, para los tests de sus casos de uso.

import { Actor, type PageSlice } from '../../shared';
import type { NotificationQuery } from '../application/ports/notification-query';
import type { NotificationRow } from '../contracts';
import {
  Notification,
  type NotificationId,
  type NotificationSnapshot,
} from '../domain/notification';
import type { NotificationRepository } from '../domain/notification.repository';

export const USER_ID = '00000000-0000-7000-8000-00000000a001';
export const OTHER_USER_ID = '00000000-0000-7000-8000-00000000a002';
export const CLIENT_ID = '00000000-0000-7000-8000-00000000c001';
export const OTHER_CLIENT_ID = '00000000-0000-7000-8000-00000000c002';

/** Un usuario del panel que ve sus notificaciones. */
export const TEST_USER = Actor.user(USER_ID, ['notifications:read']);
/** El job que reacciona a los eventos, con los permisos del módulo. */
export const TEST_SCHEDULER = Actor.system('scheduler', [
  'notifications:create',
  'notifications:erase-client-data',
  'notifications:merge-client-data',
]);

/**
 * Las notificaciones guardadas, como la tabla: el mismo evento para el mismo usuario se guarda una
 * vez. También es la query de la campana, con los nombres de `clientNames`.
 */
export class InMemoryNotifications implements NotificationRepository, NotificationQuery {
  readonly rows = new Map<string, NotificationSnapshot>();

  constructor(readonly clientNames = new Map<string, string>()) {}

  add(notification: Notification) {
    const row = notification.toSnapshot();
    const duplicate = [...this.rows.values()].some(
      (existing) => existing.sourceEventId === row.sourceEventId && existing.userId === row.userId,
    );
    if (duplicate) return Promise.resolve(false);
    this.rows.set(row.id, row);
    return Promise.resolve(true);
  }

  findById(id: NotificationId) {
    const row = this.rows.get(id);
    return Promise.resolve(row && Notification.restore(row));
  }

  save(notification: Notification) {
    const row = notification.toSnapshot();
    this.rows.set(row.id, row);
    return Promise.resolve();
  }

  markAllRead(userId: string, now: Date) {
    let marked = 0;
    for (const row of this.rows.values()) {
      if (row.userId !== userId || row.readAt !== undefined) continue;
      this.rows.set(row.id, { ...row, readAt: now });
      marked += 1;
    }
    return Promise.resolve(marked);
  }

  removeClients(clientIds: readonly string[]) {
    let removed = 0;
    for (const row of [...this.rows.values()]) {
      if (!row.clientIds.some((id) => clientIds.includes(id))) continue;
      this.rows.delete(row.id);
      removed += 1;
    }
    return Promise.resolve(removed);
  }

  moveClient(fromClientId: string, toClientId: string) {
    let moved = 0;
    for (const row of [...this.rows.values()]) {
      if (!row.clientIds.includes(fromClientId)) continue;
      const clientIds = [
        ...new Set(row.clientIds.map((id) => (id === fromClientId ? toClientId : id))),
      ];
      const entityId =
        row.type === 'client.assigned' && row.entityId === fromClientId ? toClientId : row.entityId;
      this.rows.set(row.id, { ...row, clientIds, entityId });
      moved += 1;
    }
    return Promise.resolve(moved);
  }

  list(
    userId: string,
    request: {
      readonly direction: 'asc' | 'desc';
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<NotificationRow>> {
    const sign = request.direction === 'desc' ? -1 : 1;
    const mine = [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort((a, b) => sign * (a.createdAt.getTime() - b.createdAt.getTime()));
    const items = mine.slice(request.offset, request.offset + request.limit).map((row) => {
      const clientId = row.clientIds[0];
      const name = clientId === undefined ? undefined : this.clientNames.get(clientId);
      return {
        id: row.id,
        type: row.type,
        entityId: row.entityId,
        client: clientId === undefined || name === undefined ? undefined : { id: clientId, name },
        read: row.readAt !== undefined,
        createdAt: row.createdAt,
      };
    });
    return Promise.resolve({ items, total: mine.length });
  }

  countUnread(userId: string) {
    return Promise.resolve(
      [...this.rows.values()].filter((row) => row.userId === userId && row.readAt === undefined)
        .length,
    );
  }
}
