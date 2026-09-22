import { sql } from 'drizzle-orm';

import type { Database } from '../db/client';
import { fromJsonb } from '../db/json';
import type { InfraLogger } from '../shared/logger';

import type { PublishedEvent } from './published-event';

export interface OutboxRelayOptions {
  readonly db: Database;
  readonly publish: (event: PublishedEvent) => Promise<void>;
  readonly logger: InfraLogger;
  readonly batchSize?: number;
  readonly intervalMs?: number;
  /** Después de estos intentos fallidos el evento queda para revisión manual. */
  readonly maxAttempts?: number;
}

interface OutboxRow extends Record<string, unknown> {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_id: string;
  readonly occurred_at: Date | string;
  readonly payload: unknown;
}

/**
 * Pasa los eventos del outbox a las colas. Toma filas pendientes con `FOR UPDATE SKIP LOCKED`
 * (varios procesos no publican el mismo evento a la vez) y las marca como publicadas.
 */
export class OutboxRelay {
  #timer: NodeJS.Timeout | undefined;
  #running: Promise<number> | undefined;
  #stopped = true;

  constructor(private readonly options: OutboxRelayOptions) {}

  start(): void {
    this.#stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    clearTimeout(this.#timer);
    await this.#running;
  }

  /** Publica un lote. Devuelve cuántos eventos se publicaron (útil en tests). */
  async relayOnce(): Promise<number> {
    const { db, publish, logger } = this.options;
    const batchSize = this.options.batchSize ?? 50;
    const maxAttempts = this.options.maxAttempts ?? 10;

    return db.transaction(async (tx) => {
      const pending = await tx.execute<OutboxRow>(sql`
        select id, event_type, aggregate_id, occurred_at, payload
        from core.outbox
        where published_at is null and attempts < ${maxAttempts}
        order by recorded_at, id
        limit ${batchSize}
        for update skip locked
      `);

      let published = 0;
      for (const row of pending.rows) {
        try {
          await publish({
            id: row.id,
            type: row.event_type,
            aggregateId: row.aggregate_id,
            occurredAt: new Date(row.occurred_at),
            payload: fromJsonb(row.payload),
          });
          await tx.execute(sql`update core.outbox set published_at = now() where id = ${row.id}`);
          published += 1;
        } catch (error) {
          logger.error(
            { err: error, eventId: row.id, eventType: row.event_type },
            'Outbox publish failed',
          );
          await tx.execute(sql`
            update core.outbox
            set attempts = attempts + 1, last_error = ${error instanceof Error ? error.message : String(error)}
            where id = ${row.id}
          `);
        }
      }
      return published;
    });
  }

  private schedule(delayMs: number): void {
    if (this.#stopped) return;
    this.#timer = setTimeout(() => {
      this.#running = this.relayOnce().catch((error: unknown) => {
        this.options.logger.error({ err: error }, 'Outbox relay iteration failed');
        return 0;
      });
      void this.#running.then((published) => {
        // Si el lote vino lleno, hay más: se sigue sin esperar.
        const full = published >= (this.options.batchSize ?? 50);
        this.schedule(full ? 0 : (this.options.intervalMs ?? 1000));
      });
    }, delayMs);
    this.#timer.unref();
  }
}
