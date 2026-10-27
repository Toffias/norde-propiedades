import type { PortalAccountDirectory, PortalCredit } from '@norde/core/portals';
import { ok } from '@norde/core/shared';

/** Cuánto se recuerdan los créditos leídos para mostrarlos. */
export const CREDITS_DISPLAY_TTL_MS = 2 * 60_000;

/**
 * Los créditos de la cuenta para mostrar (la pestaña Difusión), recordados unos minutos: abrir una
 * ficha no llama al portal cada vez, ni espera a un portal lento. Solo se recuerdan las lecturas
 * buenas. Lo que consume un crédito (publicar, reactivar, cambiar de plan) usa el directorio sin
 * cache: tiene que ver lo que queda ahora.
 */
export class CachedPortalCredits implements PortalAccountDirectory {
  readonly #cache = new Map<
    string,
    { readonly at: number; readonly credits: readonly PortalCredit[] }
  >();

  constructor(
    private readonly directory: PortalAccountDirectory,
    private readonly now: () => number,
    private readonly ttlMs = CREDITS_DISPLAY_TTL_MS,
  ) {}

  find(input: Parameters<PortalAccountDirectory['find']>[0]) {
    return this.directory.find(input);
  }

  async credits(input: Parameters<PortalAccountDirectory['credits']>[0]) {
    const key = `${input.portal}:${input.externalAccountId}`;
    const cached = this.#cache.get(key);
    if (cached && this.now() - cached.at < this.ttlMs) return ok(cached.credits);
    const read = await this.directory.credits(input);
    if (read.isOk()) this.#cache.set(key, { at: this.now(), credits: read.value });
    return read;
  }
}
