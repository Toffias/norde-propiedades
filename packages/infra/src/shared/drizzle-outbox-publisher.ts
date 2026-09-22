import type { Clock, DomainEvent, EventPublisher, IdGenerator } from '@norde/core/shared';

import type { DbExecutor } from '../db/executor';
import { toJsonb } from '../db/json';
import { outbox } from '../db/schema';

/** Guarda los eventos en el outbox, dentro de la transacción del caso de uso. */
export class DrizzleOutboxPublisher implements EventPublisher {
  constructor(
    private readonly db: DbExecutor,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async publish(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    const recordedAt = this.clock.now();
    await this.db.insert(outbox).values(
      events.map((event) => ({
        id: this.ids.next(),
        eventType: event.type,
        aggregateId: event.aggregateId,
        payload: toJsonb(event.payload),
        occurredAt: event.occurredAt,
        recordedAt,
      })),
    );
  }
}
