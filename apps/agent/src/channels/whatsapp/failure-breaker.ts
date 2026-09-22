/**
 * Corta las respuestas de error (que se cobran) cuando el agente falla en cadena: OpenAI
 * caído, sin créditos, clave inválida. Mientras está abierto, los mensajes solo se registran
 * y se loguea en nivel error para que salte una alerta.
 */
export class FailureBreaker {
  #consecutiveFailures = 0;
  #openedAt: number | undefined;

  constructor(
    private readonly threshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  isOpen(): boolean {
    if (this.#openedAt === undefined) return false;
    if (this.now() - this.#openedAt >= this.cooldownMs) {
      // Pasó el enfriamiento: se permite un intento (half-open).
      this.#openedAt = undefined;
      this.#consecutiveFailures = this.threshold - 1;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.#consecutiveFailures = 0;
    this.#openedAt = undefined;
  }

  /** Devuelve `true` si este fallo abrió el breaker. */
  recordFailure(): boolean {
    this.#consecutiveFailures += 1;
    if (this.#openedAt === undefined && this.#consecutiveFailures >= this.threshold) {
      this.#openedAt = this.now();
      return true;
    }
    return false;
  }
}
