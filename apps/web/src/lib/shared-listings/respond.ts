import {
  ReactToSharedListingInputSchema,
  SharedListingTokenInputSchema,
  type ReactToSharedListingInput,
  type SharedListingTokenInput,
} from '@norde/core/clients/contracts';

/** Lo que vuelve al navegador: sin detalles internos. */
export type RespondOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'invalid' | 'rate_limited' | 'unavailable' };

/** Lo justo de los casos de uso que hace falta, para probar el borde sin base. */
export interface SharedListingResponder {
  open(input: SharedListingTokenInput): Promise<{ isOk(): boolean }>;
  react(input: ReactToSharedListingInput): Promise<{ isOk(): boolean }>;
}

/**
 * El borde público de la página de un envío: valida con el contract del core, frena por IP y
 * llama al caso de uso. Lo que llega del navegador es dato: no se confía en nada.
 */
export function createSharedListingResponses(deps: {
  readonly responder: () => SharedListingResponder;
  readonly allowOpen: (ip: string) => boolean;
  readonly allowReact: (ip: string) => boolean;
}) {
  return {
    async open(raw: unknown, ip: string): Promise<RespondOutcome> {
      const parsed = SharedListingTokenInputSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, reason: 'invalid' };
      if (!deps.allowOpen(ip)) return { ok: false, reason: 'rate_limited' };
      const result = await deps.responder().open(parsed.data);
      return result.isOk() ? { ok: true } : { ok: false, reason: 'unavailable' };
    },
    async react(raw: unknown, ip: string): Promise<RespondOutcome> {
      const parsed = ReactToSharedListingInputSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, reason: 'invalid' };
      if (!deps.allowReact(ip)) return { ok: false, reason: 'rate_limited' };
      const result = await deps.responder().react(parsed.data);
      return result.isOk() ? { ok: true } : { ok: false, reason: 'unavailable' };
    },
  };
}
