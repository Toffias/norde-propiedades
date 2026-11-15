/**
 * Los últimos IDs vistos, con tope: el más viejo sale cuando entra uno nuevo. Vive en memoria
 * (una sola instancia): después de un reinicio, la deduplicación la hace el core al registrar.
 */
export class RecentIds {
  readonly #ids = new Set<string>();

  constructor(private readonly capacity: number) {}

  add(id: string): void {
    this.#ids.delete(id);
    this.#ids.add(id);
    if (this.#ids.size > this.capacity) {
      const oldest = this.#ids.values().next();
      if (!oldest.done) this.#ids.delete(oldest.value);
    }
  }

  has(id: string): boolean {
    return this.#ids.has(id);
  }
}
