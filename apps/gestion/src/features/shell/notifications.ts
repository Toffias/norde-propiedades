import type { NotificationRow, NotificationTypeValue } from '@norde/core/notifications/contracts';

// Cómo se muestran en la campana de la barra los avisos a quien entra (#112).

/** Cada cuánto se vuelve a contar las no leídas con la campana cerrada. */
export const UNREAD_POLL_MS = 60_000;

const SUBJECTS: Readonly<Record<Exclude<NotificationTypeValue, 'client.assigned'>, string>> = {
  'opportunity.assigned': 'una oportunidad',
  'inquiry.assigned': 'una consulta',
};

/** "Te asignaron una consulta de Ana Pérez". El nombre es el de hoy, no el de cuando se asignó. */
export function notificationText(row: NotificationRow): string {
  const name = row.client?.name;
  if (row.type === 'client.assigned') {
    if (name !== undefined) return `Te asignaron el contacto ${name}`;
    return row.client === undefined
      ? 'Te asignaron un contacto que ya no existe'
      : 'Te asignaron un contacto sin nombre';
  }
  const who =
    name ?? (row.client === undefined ? 'un contacto que ya no existe' : 'un contacto sin nombre');
  return `Te asignaron ${SUBJECTS[row.type]} de ${who}`;
}

/**
 * A dónde lleva: la ficha del contacto (las oportunidades y las consultas asignadas, en su pestaña
 * de oportunidades). Sin contacto, a ningún lado.
 */
export function notificationHref(row: NotificationRow): string | undefined {
  if (row.client === undefined) return undefined;
  const ficha = `/contactos/${row.client.id}`;
  return row.type === 'client.assigned' ? ficha : `${ficha}?tab=oportunidades`;
}

/** El número de la campana: "99+" de ahí para arriba. */
export function badgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
