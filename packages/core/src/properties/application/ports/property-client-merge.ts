/** Lo que la unificación de un contacto pasó al que queda, para dejarlo en el historial. */
export interface MovedClientLinks {
  /** Propiedades con una reserva o un propietario que apuntaban al duplicado. */
  readonly propertyIds: readonly string[];
  /** Emprendimientos que lo tenían como contacto comercial. */
  readonly developmentIds: readonly string[];
}

/** Pasa al contacto que queda las referencias de properties a un duplicado unificado. */
export interface PropertyClientMerge {
  /**
   * Reservas, propietarios y contacto comercial de emprendimientos. Si los dos eran propietarios de
   * la misma propiedad, queda una sola fila. Idempotente.
   */
  moveClient(fromClientId: string, toClientId: string): Promise<MovedClientLinks>;
}
