import type { Id } from '../../shared/domain/id';

export type NotificationId = Id<'Notification'>;

/**
 * De qué avisa: te asignaron un contacto, una oportunidad o una consulta. El texto lo arma la
 * pantalla; acá solo viajan el tipo y los IDs.
 */
export const NOTIFICATION_TYPES = [
  'client.assigned',
  'opportunity.assigned',
  'inquiry.assigned',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationSnapshot {
  readonly id: NotificationId;
  /** Usuario del módulo identity que la recibe: solo el ID. */
  readonly userId: string;
  readonly type: NotificationType;
  /** El contacto, la oportunidad o la consulta (de clients): solo el ID. */
  readonly entityId: string;
  /** Clientes de los que habla, para suprimirla con ellos. El primero es el de la ficha. */
  readonly clientIds: readonly string[];
  /** El evento que la originó: un evento procesado dos veces avisa una sola vez. */
  readonly sourceEventId: string;
  readonly createdAt: Date;
  readonly readAt: Date | undefined;
}

/**
 * Aviso a un usuario del panel. Es su buzón personal, no una entidad del negocio: no emite eventos
 * ni se audita (ADR 0043).
 */
export class Notification {
  #state: NotificationSnapshot;

  private constructor(state: NotificationSnapshot) {
    this.#state = state;
  }

  static create(input: Omit<NotificationSnapshot, 'readAt'>): Notification {
    return new Notification({
      ...input,
      clientIds: [...new Set(input.clientIds)],
      readAt: undefined,
    });
  }

  static restore(snapshot: NotificationSnapshot): Notification {
    return new Notification(snapshot);
  }

  get id(): NotificationId {
    return this.#state.id;
  }

  /** Solo la ve y la marca quien la recibe. */
  belongsTo(userId: string): boolean {
    return this.#state.userId === userId;
  }

  /** La marca como leída. Devuelve si cambió (una ya leída conserva su fecha). */
  markRead(now: Date): boolean {
    if (this.#state.readAt !== undefined) return false;
    this.#state = { ...this.#state, readAt: now };
    return true;
  }

  toSnapshot(): NotificationSnapshot {
    return this.#state;
  }
}
