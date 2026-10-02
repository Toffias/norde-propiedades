/** Lo que cuelga de un contacto fuera de su aggregate, por tipo. */
export interface ClientRecordCounts {
  readonly opportunities: number;
  readonly activities: number;
  readonly savedSearches: number;
  readonly featuredListings: number;
  readonly sharedListings: number;
  readonly inquiries: number;
  /** Relaciones que otros contactos declaran hacia él. */
  readonly incomingRelations: number;
}

/**
 * Los registros del módulo que referencian a un contacto por ID y no son parte de su aggregate
 * (oportunidades, actividad, búsquedas, destacadas, envíos, consultas, relaciones entrantes). Al
 * unificar se reapuntan todos al principal, dentro de la misma transacción.
 */
export interface ClientLinkedRecords {
  countFor(clientId: string): Promise<ClientRecordCounts>;
  /**
   * Reapunta todo de `fromId` a `toId` y devuelve cuántos se movieron. Lo que chocaría con algo
   * que el principal ya tiene (la misma propiedad destacada, la misma relación) no se pierde: la
   * destacada repetida queda quitada y la relación repetida se descarta.
   */
  moveAll(fromId: string, toId: string, now: Date): Promise<ClientRecordCounts>;
}
