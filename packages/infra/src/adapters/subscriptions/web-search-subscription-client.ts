import { createHmac } from 'node:crypto';

/**
 * Lo que manda la web cuando alguien pide suscribirse a una búsqueda (#208). Los montos van en
 * unidades, como los escribió la persona (`"150000"`); gestión los pasa a centavos.
 */
export interface WebSearchSubscription {
  readonly name: string;
  readonly email: string;
  readonly frequency: 'every_3_days' | 'weekly' | 'monthly';
  readonly summary: string;
  readonly operation: string;
  readonly propertyTypes: readonly string[];
  readonly currency?: string;
  readonly minPrice?: string;
  readonly maxPrice?: string;
  readonly locationIds: readonly string[];
  readonly minRooms?: number;
}

export type WebSearchSubscriptionOutcome =
  | { readonly kind: 'requested' }
  /** Gestión rechazó los datos (email inválido, criterios inválidos). */
  | { readonly kind: 'rejected'; readonly reason: string }
  /** Gestión recibe demasiados pedidos: hay que esperar. */
  | { readonly kind: 'busy' };

function rejectionReason(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body;
    if (typeof error === 'string') return error;
  }
  return 'unknown';
}

/**
 * Manda el pedido de suscripción del sitio público al webhook de `apps/gestion`, que manda el
 * email de confirmación. Firmado con el secreto que comparte con las consultas
 * (`x-norde-signature: sha256=` + HMAC del body). Un error de red o de gestión lanza.
 */
export class WebSearchSubscriptionClient {
  constructor(
    private readonly options: {
      /** `https://<panel>/api/webhooks/subscriptions/web`. */
      readonly url: string;
      readonly secret: string;
      readonly fetch?: typeof fetch;
    },
  ) {}

  async send(subscription: WebSearchSubscription): Promise<WebSearchSubscriptionOutcome> {
    const body = JSON.stringify(subscription);
    const signature = createHmac('sha256', this.options.secret).update(body).digest('hex');
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-norde-signature': `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { kind: 'requested' };
    if (response.status === 429) return { kind: 'busy' };
    if (response.status === 400 || response.status === 422) {
      return { kind: 'rejected', reason: rejectionReason(await response.json()) };
    }
    throw new Error(`Search subscription webhook responded ${response.status}`);
  }
}
