/** Los propietarios de una propiedad: clientes del módulo clients, solo por ID. */
export interface PropertyOwnerLinks {
  /** Lo vincula como propietario. Idempotente. `actorId` queda como autor del vínculo. */
  add(propertyId: string, clientId: string, actorId: string): Promise<void>;
}
