import { createHmac } from 'node:crypto';

import type { PublicSite } from '@norde/core/properties';

import type { InfraLogger } from '../../shared/logger';

/** El header de la firma, el mismo de los webhooks propios (`sha256=` + HMAC del body crudo). */
export const PUBLIC_SITE_SIGNATURE_HEADER = 'x-norde-signature';

/**
 * Le avisa a apps/web que una propiedad cambió: `POST /api/revalidate` firmado con el secreto
 * compartido (ADR 0023). Si la web responde con error, lanza: el job se reintenta.
 */
export class WebhookPublicSite implements PublicSite {
  constructor(
    private readonly options: {
      /** `https://<sitio>/api/revalidate`. */
      readonly url: string;
      readonly secret: string;
      readonly fetch?: typeof fetch;
    },
  ) {}

  async revalidateProperty(propertyId: string): Promise<void> {
    const body = JSON.stringify({ propertyId });
    const signature = createHmac('sha256', this.options.secret).update(body).digest('hex');
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [PUBLIC_SITE_SIGNATURE_HEADER]: `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Public site revalidation responded ${response.status}`);
  }
}

/** Sin web configurada (desarrollo): deja constancia en el log y la web se refresca sola. */
export class LogPublicSite implements PublicSite {
  constructor(private readonly logger: InfraLogger) {}

  revalidateProperty(propertyId: string): Promise<void> {
    this.logger.info({ propertyId }, 'Public site revalidation skipped: not configured');
    return Promise.resolve();
  }
}
