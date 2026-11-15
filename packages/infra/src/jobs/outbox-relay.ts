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
  /**
   * Después de estos intentos fallidos el evento queda agotado, para revisión manual
   * (`exhaustedCount` lo avisa). Con el backoff, 20 intentos cubren unas 10 horas de caída.
   */
  readonly maxAttempts?: number;
}

/** Espera máxima entre intentos: después de cada fallo son 2, 4, 8... segundos, hasta una hora. */
const MAX_RETRY_DELAY_SECONDS = 3600;
const DEFAULT_MAX_ATTEMPTS = 20;

interface OutboxRow extends Record<string, unknown> {
  readonly id: string;
  readonly event_type: string;
  readonly aggregate_id: string;
  readonly occurred_at: Date | string;
  readonly payload: unknown;
}

/**
 * Pasa los eventos del outbox a las colas. Toma filas pendientes con `FOR UPDATE SKIP LOCKED`
 * (varios procesos no publican el mismo evento a la vez) y las marca como publicadas. Una que
 * falla espera cada vez más antes del próximo intento (#221): una caída de pg-boss de unos
 * segundos no agota los intentos.
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
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    return db.transaction(async (tx) => {
      const pending = await tx.execute<OutboxRow>(sql`
        select id, event_type, aggregate_id, occurred_at, payload
        from core.outbox
        where published_at is null
          and attempts < ${maxAttempts}
          and (next_attempt_at is null or next_attempt_at <= now())
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
            set attempts = attempts + 1,
                last_error = ${error instanceof Error ? error.message : String(error)},
                next_attempt_at = now()
                  + least(power(2, greatest(attempts + 1, 1)), ${MAX_RETRY_DELAY_SECONDS})
                  * interval '1 second'
            where id = ${row.id}
          `);
        }
      }
      return published;
    });
  }

  /**
   * Eventos que agotaron los intentos y no se publicaron: nadie reacciona a ellos (portales, sitio,
   * notificaciones) hasta que alguien los reintente (`attempts = 0`). Lo consulta un chequeo
   * programado que avisa.
   */
  async exhaustedCount(): Promise<number> {
    const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const result = await this.options.db.execute<{ readonly count: number }>(sql`
      select count(*)::int as count
      from core.outbox
      where published_at is null and attempts >= ${maxAttempts}
    `);
    return result.rows[0]?.count ?? 0;
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
