import type { DomainEvent } from './domain-event';

/**
 * Raíz de un aggregate: única puerta de entrada para modificar su estado.
 * Registra los eventos de dominio que produce; el caso de uso los extrae con `pullEvents()`
 * y los publica en el outbox dentro de la misma transacción.
 */
export abstract class AggregateRoot<TId extends string, TEvent extends DomainEvent = DomainEvent> {
  readonly #events: TEvent[] = [];

  protected constructor(readonly id: TId) {}

  protected record(event: TEvent): void {
    this.#events.push(event);
  }

  /** Devuelve los eventos pendientes y los descarta del aggregate. */
  pullEvents(): readonly TEvent[] {
    return this.#events.splice(0, this.#events.length);
  }
}
