/**
 * Serializa el trabajo por clave (el número del contacto): sus mensajes se procesan en orden
 * y nunca corren dos turnos del agente a la vez sobre la misma conversación. Contactos
 * distintos sí corren en paralelo.
 */
export class KeyedQueue {
  readonly #tails = new Map<string, Promise<void>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#tails.set(key, tail);
    void tail.then(() => {
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    });
    return result;
  }

  /** Espera a que termine todo lo encolado hasta ahora. */
  async idle(): Promise<void> {
    await Promise.all(this.#tails.values());
  }

  get size(): number {
    return this.#tails.size;
  }
}
