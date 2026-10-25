/** Los propietarios de una propiedad: clientes del módulo clients, solo por ID. */
export interface PropertyOwnerLinks {
  /** Lo vincula como propietario. Idempotente. `actorId` queda como autor del vínculo. */
  add(propertyId: string, clientId: string, actorId: string): Promise<void>;
  /** Lo desvincula. Idempotente. */
  remove(propertyId: string, clientId: string): Promise<void>;
  /** Si tiene al menos un propietario. */
  hasAny(propertyId: string): Promise<boolean>;
  /** Si ese cliente es propietario de la propiedad. */
  has(propertyId: string, clientId: string): Promise<boolean>;
  /** Cuántos propietarios tiene. */
  count(propertyId: string): Promise<number>;
  /**
   * Si el cliente puede quedar como propietario: existe, no está en la papelera y no se unificó
   * con otro.
   */
  isLinkable(clientId: string): Promise<boolean>;
}
