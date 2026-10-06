import { createHmac } from 'node:crypto';

/** Lo que manda la web por cada envío del formulario de consulta (ADR 0021). */
export interface WebInquiry {
  /** Lo genera la web por envío: un reintento con el mismo ID no crea otra consulta. */
  readonly externalId: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly message: string;
  readonly propertyId?: string;
}

export type WebInquiryOutcome =
  | { readonly kind: 'received' }
  /** Gestión rechazó los datos (teléfono o email inválido, sin forma de contacto). */
  | { readonly kind: 'rejected'; readonly reason: string }
  /** Gestión recibe demasiadas consultas: hay que esperar. */
  | { readonly kind: 'busy' };

function rejectionReason(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body;
    if (typeof error === 'string') return error;
  }
  return 'unknown';
}

/**
 * Manda una consulta del sitio público al webhook de `apps/gestion`, firmada con el secreto
 * compartido (`x-norde-signature: sha256=` + HMAC del body). Un error de red o de gestión lanza.
 */
export class WebInquiryClient {
  constructor(
    private readonly options: {
      /** `https://<panel>/api/webhooks/inquiries/web`. */
      readonly url: string;
      readonly secret: string;
      readonly fetch?: typeof fetch;
    },
  ) {}

  async send(inquiry: WebInquiry): Promise<WebInquiryOutcome> {
    const body = JSON.stringify(inquiry);
    const signature = createHmac('sha256', this.options.secret).update(body).digest('hex');
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-norde-signature': `sha256=${signature}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { kind: 'received' };
    if (response.status === 429) return { kind: 'busy' };
    if (response.status === 400 || response.status === 422) {
      return { kind: 'rejected', reason: rejectionReason(await response.json()) };
    }
    throw new Error(`Web inquiry webhook responded ${response.status}`);
  }
}
