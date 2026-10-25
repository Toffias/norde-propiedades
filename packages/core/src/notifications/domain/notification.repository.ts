import type { Notification, NotificationId } from './notification';

export interface NotificationRepository {
  /**
   * La guarda, salvo que ya haya una del mismo evento para el mismo usuario (el job se reintentó).
   * Devuelve si la agregó.
   */
  add(notification: Notification): Promise<boolean>;
  findById(id: NotificationId): Promise<Notification | undefined>;
  save(notification: Notification): Promise<void>;
  /** Marca como leídas las no leídas del usuario. Devuelve cuántas. */
  markAllRead(userId: string, now: Date): Promise<number>;
  /** Borra las que hablan de esos clientes (supresión). Devuelve cuántas. */
  removeClients(clientIds: readonly string[]): Promise<number>;
  /**
   * Las del duplicado pasan al contacto que queda (unificación): sus IDs y, si avisaban del
   * duplicado mismo, la ficha. Devuelve cuántas.
   */
  moveClient(fromClientId: string, toClientId: string): Promise<number>;
}
