import { PgBoss } from 'pg-boss';

import type { InfraLogger } from '../shared/logger';

import { PublishedEventJobSchema, toJobData, type PublishedEvent } from './published-event';

export interface EventSubscription {
  /** Tipo de evento (ej. `clients.opportunity_created`). */
  readonly eventType: string;
  /** Nombre corto y único del handler: la cola es `<eventType>.<name>`. */
  readonly name: string;
  /**
   * Maneja el evento. Si lanza, pg-boss reintenta con backoff; si agota los reintentos, el evento
   * pasa a la cola de descarte (`<cola>.dead`) y se registra como error. Tiene que ser idempotente:
   * un evento puede llegar dos veces.
   */
  handle(event: PublishedEvent): Promise<void>;
  /**
   * Cuánto puede tardar un evento antes de que pg-boss lo dé por vencido y lo reintente (15 minutos
   * si no se dice). Para los handlers largos, como una importación entera.
   */
  readonly expireInSeconds?: number;
  /**
   * Agrupa los eventos del mismo aggregate: como mucho un job cada tantos segundos, y los que llegan
   * en el medio se juntan en uno al final del intervalo (no se pierden). Para los handlers que
   * releen todo y pueden recibir ráfagas, como la lectura de contactos de un portal.
   */
  readonly throttleSeconds?: number;
}

/** Un trabajo que corre solo, cada tanto (cron de pg-boss). */
export interface ScheduledJob {
  /** Nombre único: es la cola del trabajo. */
  readonly name: string;
  /** Cron de 5 campos, en hora de Buenos Aires (ej. `*\/10 * * * *`, cada 10 minutos). */
  readonly cron: string;
  /** Si lanza, pg-boss no reintenta: la próxima corrida lo vuelve a intentar. */
  run(): Promise<void>;
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
  readonly #scheduled: ScheduledJob[] = [];
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

  /** Registrar antes de `start()`. pg-boss guarda el cron: con varias instancias corre una sola vez. */
  schedule(job: ScheduledJob): void {
    if (this.#started) throw new Error('Schedule before starting the event bus');
    this.#scheduled.push(job);
  }

  async start(): Promise<void> {
    await this.#boss.start();
    for (const job of this.#scheduled) {
      await this.#ensureQueue(job.name, { retryLimit: 0 });
      await this.#boss.schedule(job.name, job.cron, null, {
        tz: 'America/Argentina/Buenos_Aires',
      });
      await this.#boss.work(job.name, async () => {
        try {
          await job.run();
        } catch (error) {
          // Sin reintentos: si no se registra acá, la falla queda solo en la tabla de pg-boss.
          this.options.logger.error({ err: error, job: job.name }, 'Scheduled job failed');
          throw error;
        }
      });
    }
    for (const subscription of [...this.#subscriptions.values()].flat()) {
      const queue = queueName(subscription);
      const deadLetter = deadLetterQueueName(queue);
      // La cola de descarte tiene que existir antes: la cola principal la referencia.
      await this.#ensureQueue(deadLetter, {
        retryLimit: 0,
        deleteAfterSeconds: DEAD_LETTER_RETENTION_SECONDS,
      });
      await this.#ensureQueue(queue, {
        retryLimit: this.options.retryLimit ?? 5,
        retryBackoff: true,
        retryDelay: RETRY_DELAY_SECONDS,
        retryDelayMax: RETRY_DELAY_MAX_SECONDS,
        expireInSeconds: subscription.expireInSeconds ?? DEFAULT_EXPIRE_SECONDS,
        deadLetter,
      });
      await this.#boss.work<unknown>(queue, async (jobs) => {
        for (const job of jobs) {
          const event = PublishedEventJobSchema.parse(job.data);
          try {
            await subscription.handle(event);
          } catch (error) {
            this.options.logger.warn(
              { err: error, queue, jobId: job.id, eventId: event.id, eventType: event.type },
              'Event handler failed, pg-boss will retry it',
            );
            throw error;
          }
        }
      });
      await this.#boss.work<unknown>(deadLetter, (jobs) => {
        for (const job of jobs) {
          this.#reportDeadLetter(queue, job.data);
        }
        return Promise.resolve();
      });
    }
    this.#started = true;
  }

  /**
   * Un evento que agotó los reintentos: pg-boss copia el job a la cola de descarte. Se registra
   * como error (solo IDs y tipo, sin el payload, que puede traer datos personales) y el job queda
   * en `pgboss.job` para revisarlo o reencolarlo a mano.
   */
  #reportDeadLetter(queue: string, data: unknown): void {
    const parsed = PublishedEventJobSchema.safeParse(data);
    this.options.logger.error(
      parsed.success
        ? {
            queue,
            eventId: parsed.data.id,
            eventType: parsed.data.type,
            aggregateId: parsed.data.aggregateId,
          }
        : { queue },
      'Event handler exhausted its retries: event moved to the dead letter queue',
    );
  }

  /** Encola el evento para cada suscriptor. Reenviar el mismo evento no duplica jobs. */
  async publish(event: PublishedEvent): Promise<void> {
    for (const subscription of this.#subscriptions.get(event.type) ?? []) {
      const { throttleSeconds } = subscription;
      await this.#boss.send(queueName(subscription), toJobData(event), {
        id: event.id,
        ...(throttleSeconds === undefined
          ? {}
          : {
              singletonKey: event.aggregateId,
              singletonSeconds: throttleSeconds,
              singletonNextSlot: true,
            }),
      });
    }
  }

  /**
   * Crea la cola o, si ya existía, le aplica las opciones de ahora: `createQueue` de pg-boss no
   * toca una cola existente, y cambiar los reintentos o el vencimiento no tendría efecto.
   */
  async #ensureQueue(name: string, settings: QueueSettings): Promise<void> {
    await this.#boss.createQueue(name, settings);
    await this.#boss.updateQueue(name, settings);
  }

  async stop(): Promise<void> {
    if (!this.#started) return;
    await this.#boss.stop({ graceful: true, timeout: 10_000 });
    this.#started = false;
  }
}

/**
 * Lo que se configura de cada cola. Todo explícito: al actualizar una cola existente, lo que no
 * se pasa queda como estaba (y sacar `expireInSeconds` de un handler no volvería al default).
 */
interface QueueSettings {
  readonly retryLimit: number;
  readonly retryBackoff?: boolean;
  readonly retryDelay?: number;
  readonly retryDelayMax?: number;
  readonly expireInSeconds?: number;
  readonly deleteAfterSeconds?: number;
  readonly deadLetter?: string;
}

/**
 * Base del backoff de los reintentos: con la de pg-boss (1 segundo) los cinco intentos entran en un
 * minuto, y una caída de un portal o un 429 que dure más agota los reintentos. Con 30 segundos
 * duplicando hasta 10 minutos, los cinco cubren unos 15 minutos.
 */
const RETRY_DELAY_SECONDS = 30;
const RETRY_DELAY_MAX_SECONDS = 10 * 60;

/** El vencimiento de pg-boss si el handler no dice otro: 15 minutos. */
const DEFAULT_EXPIRE_SECONDS = 15 * 60;

/** Cuánto quedan en la base los eventos descartados, para revisarlos: 30 días. */
const DEAD_LETTER_RETENTION_SECONDS = 30 * 24 * 60 * 60;

function queueName(subscription: EventSubscription): string {
  return `${subscription.eventType}.${subscription.name}`;
}

/** La cola de descarte de cada suscripción: `<eventType>.<name>.dead`. */
export function deadLetterQueueName(queue: string): string {
  return `${queue}.dead`;
}
