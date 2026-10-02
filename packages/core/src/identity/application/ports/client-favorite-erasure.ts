/** Borra los favoritos que apuntan a clientes suprimidos (Ley 25.326). */
export interface ClientFavoriteErasure {
  /** Los quita de los favoritos de todos los usuarios. Devuelve cuántos borró. */
  removeClients(clientIds: readonly string[]): Promise<number>;
}
