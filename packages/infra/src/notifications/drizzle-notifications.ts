import {
  NOTIFICATION_TYPES,
  Notification,
  type NotificationId,
  type NotificationQuery,
  type NotificationRepository,
  type NotificationRow,
  type NotificationType,
} from '@norde/core/notifications';
import type { PageSlice } from '@norde/core/shared';
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { clients, notifications } from '../db/schema';

const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);

/** La entidad de la que avisa cada tipo, para `entity_type`. */
const ENTITY_TYPES: Readonly<Record<NotificationType, string>> = {
  'client.assigned': 'client',
  'opportunity.assigned': 'opportunity',
  'inquiry.assigned': 'inquiry',
};

/** El contacto de la ficha: el primero de `client_ids` (en Postgres los arrays empiezan en 1). */
const mainClientId = sql`${notifications.clientIds}[1]`;

/** Las de un usuario. Todas las que se crean tienen entidad (las columnas son de la `0001`). */
function ofUser(userId: string) {
  return and(eq(notifications.userId, userId), isNotNull(notifications.entityId));
}

/** Las notificaciones de los usuarios del panel (ADR 0043). */
export class DrizzleNotifications implements NotificationRepository, NotificationQuery {
  constructor(private readonly db: DbExecutor) {}

  async add(notification: Notification): Promise<boolean> {
    const row = notification.toSnapshot();
    const inserted = await this.db
      .insert(notifications)
      .values({
        id: row.id,
        userId: row.userId,
        type: row.type,
        entityType: ENTITY_TYPES[row.type],
        entityId: row.entityId,
        clientIds: [...row.clientIds],
        sourceEventId: row.sourceEventId,
        readAt: row.readAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
      })
      .onConflictDoNothing({ target: [notifications.sourceEventId, notifications.userId] })
      .returning({ id: notifications.id });
    return inserted.length > 0;
  }

  async findById(id: NotificationId): Promise<Notification | undefined> {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);
    if (!row?.entityId || !row.sourceEventId) return undefined;
    return Notification.restore({
      id,
      userId: row.userId,
      type: NotificationTypeSchema.parse(row.type),
      entityId: row.entityId,
      clientIds: row.clientIds,
      sourceEventId: row.sourceEventId,
      createdAt: row.createdAt,
      readAt: row.readAt ?? undefined,
    });
  }

  async save(notification: Notification): Promise<void> {
    const row = notification.toSnapshot();
    // Lo único que cambia de una notificación es si se leyó.
    await this.db
      .update(notifications)
      .set({ readAt: row.readAt ?? null, updatedAt: row.readAt ?? row.createdAt })
      .where(eq(notifications.id, row.id));
  }

  async markAllRead(userId: string, now: Date): Promise<number> {
    const marked = await this.db
      .update(notifications)
      .set({ readAt: now, updatedAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return marked.length;
  }

  async removeClients(clientIds: readonly string[]): Promise<number> {
    if (clientIds.length === 0) return 0;
    const removed = await this.db
      .delete(notifications)
      .where(arrayOverlaps(notifications.clientIds, [...clientIds]))
      .returning({ id: notifications.id });
    return removed.length;
  }

  async moveClient(fromClientId: string, toClientId: string): Promise<number> {
    const moved = await this.db
      .update(notifications)
      .set({
        // Sin repetir el que queda, si ya estaba.
        clientIds: sql`array(select c.id from unnest(array_replace(${notifications.clientIds}, ${fromClientId}::uuid, ${toClientId}::uuid)) with ordinality as c(id, n) group by c.id order by min(c.n))`,
        entityId: sql`case when ${notifications.entityType} = 'client' and ${notifications.entityId} = ${fromClientId}::uuid then ${toClientId}::uuid else ${notifications.entityId} end`,
      })
      .where(arrayContains(notifications.clientIds, [fromClientId]))
      .returning({ id: notifications.id });
    return moved.length;
  }

  async list(
    userId: string,
    request: {
      readonly direction: 'asc' | 'desc';
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<NotificationRow>> {
    const order = request.direction === 'desc' ? desc : asc;
    const mine = ofUser(userId);
    const [rows, [totals]] = await Promise.all([
      this.db
        .select({
          id: notifications.id,
          type: notifications.type,
          entityId: notifications.entityId,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          clientId: clients.id,
          clientName: clients.name,
        })
        .from(notifications)
        // El nombre de hoy del contacto: lo lee de clients, como las Noticias.
        .leftJoin(clients, eq(clients.id, mainClientId))
        .where(mine)
        .orderBy(order(notifications.createdAt), order(notifications.id))
        .offset(request.offset)
        .limit(request.limit),
      this.db.select({ total: count() }).from(notifications).where(mine),
    ]);
    return {
      // `ofUser` ya dejó afuera las que no tienen entidad.
      items: rows.flatMap((row) =>
        row.entityId === null
          ? []
          : [
              {
                id: row.id,
                type: NotificationTypeSchema.parse(row.type),
                entityId: row.entityId,
                client:
                  row.clientId === null
                    ? undefined
                    : { id: row.clientId, name: row.clientName ?? undefined },
                read: row.readAt !== null,
                createdAt: row.createdAt,
              },
            ],
      ),
      total: totals?.total ?? 0,
    };
  }

  async countUnread(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ unread: count() })
      .from(notifications)
      .where(and(ofUser(userId), isNull(notifications.readAt)));
    return row?.unread ?? 0;
  }
}
