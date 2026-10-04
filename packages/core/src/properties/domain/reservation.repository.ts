import type { PropertyId } from './property';
import type { Reservation, ReservationId } from './reservation';

export interface ReservationRepository {
  findById(id: ReservationId): Promise<Reservation | undefined>;
  findActiveByProperty(propertyId: PropertyId): Promise<Reservation | undefined>;
  /**
   * Da de alta una reserva nueva. Devuelve `false` si la propiedad ya tiene una reserva activa (el
   * índice único de la base la rechaza, también entre transacciones concurrentes).
   */
  insert(reservation: Reservation, actorId: string): Promise<boolean>;
  /** Guarda los cambios de una reserva existente. `actorId` queda en `updated_by`. */
  save(reservation: Reservation, actorId: string): Promise<void>;
  /** Hasta `limit` reservas activas de esos clientes (para la supresión de sus datos). */
  findActiveByClients(clientIds: readonly string[], limit: number): Promise<readonly Reservation[]>;
  /** Borra físicamente una reserva (supresión de los datos de su cliente). */
  remove(reservation: Reservation): Promise<void>;
  /** Borra físicamente las reservas de esos clientes. Devuelve cuántas borró. */
  deleteByClients(clientIds: readonly string[]): Promise<number>;
}
