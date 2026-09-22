/**
 * Hecho de negocio que ya ocurrió (nombre en pasado: `PropertyPublished`).
 * Se guarda en el outbox en la misma transacción que el cambio que lo originó.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly aggregateId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}
