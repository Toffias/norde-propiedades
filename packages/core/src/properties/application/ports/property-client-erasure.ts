/** Quita de las propiedades las referencias a clientes suprimidos (Ley 25.326). */
export interface PropertyClientErasure {
  /**
   * Los quita como propietarios y como contacto comercial de un emprendimiento. Devuelve cuántos
   * vínculos quitó.
   */
  unlinkClients(clientIds: readonly string[]): Promise<number>;
}
