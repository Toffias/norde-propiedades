// Contracts de las notificaciones de la campana de la barra superior: los avisos a cada usuario.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

/** Los mismos que `NOTIFICATION_TYPES` del dominio (lo verifica un test). */
export const NOTIFICATION_TYPE_VALUES = [
  'client.assigned',
  'opportunity.assigned',
  'inquiry.assigned',
] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPE_VALUES)[number];

/** La campana muestra pocas por vez; el resto se pide con "Ver más". */
export const NOTIFICATIONS_PAGE_SIZE = 10;
export const MAX_NOTIFICATIONS_PAGE_SIZE = 50;

/** Las de quien consulta, de la más nueva a la más vieja. */
export const ListNotificationsQuerySchema = pageQuerySchema({
  sortable: ['createdAt'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend({
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_NOTIFICATIONS_PAGE_SIZE)
    .default(NOTIFICATIONS_PAGE_SIZE),
});
export type ListNotificationsQuery = z.input<typeof ListNotificationsQuerySchema>;

export const MarkNotificationReadInputSchema = z.object({ notificationId: z.uuid() });
export type MarkNotificationReadInput = z.input<typeof MarkNotificationReadInputSchema>;

/**
 * Una asignación que llegó en un evento de clients: el contacto (`client.assigned`), la oportunidad
 * o la consulta. `assignedBy` e `inquiryId` faltan en los eventos de antes de las notificaciones.
 */
export const NotifyAssignmentInputSchema = z.object({
  sourceEventId: z.uuid(),
  type: z.enum(NOTIFICATION_TYPE_VALUES),
  entityId: z.uuid(),
  clientId: z.uuid(),
  fromAgentId: z.string().optional(),
  toAgentId: z.string().optional(),
  assignedBy: z.string().optional(),
  inquiryId: z.string().optional(),
  occurredAt: z.date(),
});
export type NotifyAssignmentInput = z.input<typeof NotifyAssignmentInputSchema>;

export interface NotificationRow {
  readonly id: string;
  readonly type: NotificationTypeValue;
  /** El contacto, la oportunidad o la consulta. */
  readonly entityId: string;
  /** El contacto de la ficha a la que lleva, con su nombre de hoy. Sin él, ya no existe. */
  readonly client: { readonly id: string; readonly name: string } | undefined;
  readonly read: boolean;
  readonly createdAt: Date;
}

/** Una página de la lista (la misma forma que `Page`), con el contador de la campana. */
export interface NotificationsPage {
  readonly items: readonly NotificationRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Cuántas no leyó, para el contador de la campana. */
  readonly unread: number;
}
