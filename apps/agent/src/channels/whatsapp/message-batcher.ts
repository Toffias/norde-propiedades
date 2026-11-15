import type { KeyedQueue } from '../shared/keyed-queue';

export interface MessageBatcherOptions<T> {
  readonly queue: KeyedQueue;
  readonly keyOf: (item: T) => string;
  /** Silencio a esperar antes de procesar. 0 = procesar de inmediato. */
  readonly debounceMs: number;
  /**
   * Lo máximo que espera el primer mensaje del lote, aunque sigan llegando otros: alguien que
   * escribe cada pocos segundos igual recibe respuesta. Por defecto, 5 veces el silencio.
   */
  readonly maxWaitMs?: number;
  readonly now?: () => number;
  readonly process: (batch: T[]) => Promise<void>;
  readonly onError: (error: unknown, batch: T[]) => void;
}

/**
 * Agrupa los mensajes que un contacto manda seguidos ("hola" / "busco depto" / "en
 * palermo") en un solo turno del agente y una sola respuesta: menos costo en WhatsApp y en
 * OpenAI, y mejor conversación. Los turnos de un mismo contacto siguen en orden.
 *
 * Vive en memoria: el agente corre en **una** instancia (ver apps/agent/CLAUDE.md).
 */
export class MessageBatcher<T> {
  readonly #pending = new Map<
    string,
    { items: T[]; timer: NodeJS.Timeout | undefined; readonly firstAt: number }
  >();

  constructor(private readonly options: MessageBatcherOptions<T>) {}

  push(item: T): void {
    const key = this.options.keyOf(item);
    const now = (this.options.now ?? Date.now)();
    const entry = this.#pending.get(key) ?? { items: [], timer: undefined, firstAt: now };
    entry.items.push(item);
    clearTimeout(entry.timer);

    if (this.options.debounceMs <= 0) {
      this.#pending.delete(key);
      void this.flush(key, entry.items);
      return;
    }
    const maxWaitMs = this.options.maxWaitMs ?? this.options.debounceMs * 5;
    const untilMaxWait = Math.max(0, entry.firstAt + maxWaitMs - now);
    entry.timer = setTimeout(
      () => {
        this.#pending.delete(key);
        void this.flush(key, entry.items);
      },
      Math.min(this.options.debounceMs, untilMaxWait),
    );
    entry.timer.unref();
    this.#pending.set(key, entry);
  }

  /** Procesa ya lo pendiente (apagado ordenado). */
  async drain(): Promise<void> {
    const entries = [...this.#pending.entries()];
    this.#pending.clear();
    await Promise.all(
      entries.map(([key, entry]) => {
        clearTimeout(entry.timer);
        return this.flush(key, entry.items);
      }),
    );
    await this.options.queue.idle();
  }

  get pendingCount(): number {
    return this.#pending.size;
  }

  private flush(key: string, batch: T[]): Promise<void> {
    return this.options.queue
      .enqueue(key, () => this.options.process(batch))
      .catch((error: unknown) => {
        this.options.onError(error, batch);
      });
  }
}
