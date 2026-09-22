import { PgBoss } from 'pg-boss';

import type { InfraLogger } from '../shared/logger';

import { PublishedEventJobSchema, toJobData, type PublishedEvent } from './published-event';

export interface EventSubscription {
  /** Tipo de evento (ej. `clients.opportunity_created`). */
  readonly eventType: string;
  /** Nombre corto y único del handler: la cola es `<eventType>.<name>`. */
  readonly name: string;
  /**
   * Maneja el evento. Si lanza, pg-boss reintenta con backoff. Tiene que ser idempotente:
   * un evento puede llegar dos veces.
   */
  handle(event: PublishedEvent): Promise<void>;
}

export interface PgBossEventBusOptions {
  readonly connectionString: string;
  readonly logger: InfraLogger;
  readonly applicationName: string;
  /** Esquema de Postgres de pg-boss. */
  readonly schema?: string;
  readonly retryLimit?: number;
}

/**
 * Colas de eventos sobre pg-boss (misma base, esquema `pgboss`). Cada suscripción es una
 * cola propia, con sus reintentos: si un handler falla, no afecta a los otros.
 */
export class PgBossEventBus {
  readonly #boss: PgBoss;
  readonly #subscriptions = new Map<string, EventSubscription[]>();
  #started = false;

  constructor(private readonly options: PgBossEventBusOptions) {
    this.#boss = new PgBoss({
      connectionString: options.connectionString,
      schema: options.schema ?? 'pgboss',
      application_name: options.applicationName,
      max: 4,
    });
    this.#boss.on('error', (error) => {
      options.logger.error({ err: error }, 'pg-boss error');
    });
  }

  /** Registrar antes de `start()`. */
  subscribe(subscription: EventSubscription): void {
    if (this.#started) throw new Error('Subscribe before starting the event bus');
    const list = this.#subscriptions.get(subscription.eventType) ?? [];
    list.push(subscription);
    this.#subscriptions.set(subscription.eventType, list);
  }

  async start(): Promise<void> {
    await this.#boss.start();
    for (const subscription of [...this.#subscriptions.values()].flat()) {
      const queue = queueName(subscription);
      await this.#boss.createQueue(queue, {
        retryLimit: this.options.retryLimit ?? 5,
        retryBackoff: true,
      });
      await this.#boss.work<unknown>(queue, async (jobs) => {
        for (const job of jobs) {
          const event = PublishedEventJobSchema.parse(job.data);
          await subscription.handle(event);
        }
      });
    }
    this.#started = true;
  }

  /** Encola el evento para cada suscriptor. Reenviar el mismo evento no duplica jobs. */
  async publish(event: PublishedEvent): Promise<void> {
    for (const subscription of this.#subscriptions.get(event.type) ?? []) {
      await this.#boss.send(queueName(subscription), toJobData(event), { id: event.id });
    }
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    await this.#boss.stop({ graceful: true, timeout: 10_000 });
    this.#started = false;
  }
}

function queueName(subscription: EventSubscription): string {
  return `${subscription.eventType}.${subscription.name}`;
}
