import type { ErasureRecord } from '../../domain/client-erasure';

/**
 * El borrado físico de la supresión de datos (Ley 25.326). Es el único puerto que borra entradas
 * de `audit_log` (ADR 0015).
 */
export interface ClientErasure {
  /** Los duplicados unificados en este cliente (sus lápidas), como mucho `limit`. */
  mergedInto(clientId: string, limit: number): Promise<string[]>;
  /**
   * Borra los clientes y todo lo suyo dentro del módulo (teléfonos, emails, canales, relaciones
   * en los dos sentidos, etiquetas, oportunidades, actividad, consultas, búsquedas, destacadas y
   * envíos), las consultas sin asignar con alguno de sus teléfonos o emails, las entradas de
   * auditoría que los incluyen y marca como suprimidos sus IDs externos para que una importación
   * no los vuelva a crear.
   */
  erase(clientIds: readonly string[], now: Date): Promise<void>;
  /** Guarda la constancia, sin datos personales. */
  record(record: ErasureRecord): Promise<void>;
}
