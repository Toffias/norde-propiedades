import type { Mailer, MailerError, OutgoingEmail } from '@norde/core/settings';
import { err, ok, type Result } from '@norde/core/shared';
import { z } from 'zod';

import { maskEmail, type InfraLogger } from '../../shared/logger';

const ErrorResponseSchema = z.object({
  message: z.string().optional(),
  name: z.string().optional(),
});

export interface ResendMailerOptions {
  /** Sin API key o sin remitente, el envío devuelve `MailNotConfigured`. */
  readonly apiKey: string | undefined;
  /** Dirección de envío en un dominio verificado en Resend (`avisos@norde.com.ar`). */
  readonly fromAddress: string | undefined;
  readonly logger: InfraLogger;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

/**
 * Emails de salida con Resend, por HTTP y sin SDK. Un solo intento: reintentar un envío que quizás
 * llegó lo mandaría dos veces; un fallo transitorio vuelve como `MailUnavailable`.
 */
export class ResendMailer implements Mailer {
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;

  constructor(private readonly options: ResendMailerOptions) {
    this.#fetch = options.fetch ?? fetch;
    this.#endpoint = `${options.baseUrl ?? 'https://api.resend.com'}/emails`;
  }

  async send(email: OutgoingEmail): Promise<Result<void, MailerError>> {
    const { apiKey, fromAddress, logger } = this.options;
    if (apiKey === undefined || fromAddress === undefined) {
      return err({ type: 'MailNotConfigured' });
    }

    const from = email.fromName
      ? `${email.fromName.replace(/["<>]/g, '')} <${fromAddress}>`
      : fromAddress;
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          ...(email.replyTo === undefined ? {} : { reply_to: email.replyTo }),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      logger.error({ err: error, to: maskEmail(email.to) }, 'Resend unreachable');
      return err({ type: 'MailUnavailable' });
    }

    if (response.ok) {
      logger.info({ to: maskEmail(email.to) }, 'Email sent');
      return ok(undefined);
    }
    const body = ErrorResponseSchema.safeParse(await response.json().catch(() => ({}))).data;
    logger.warn(
      { status: response.status, error: body?.name, to: maskEmail(email.to) },
      'Resend rejected the email',
    );
    if (response.status === 429 || response.status >= 500) return err({ type: 'MailUnavailable' });
    return err({ type: 'MailRejected', reason: body?.message ?? `http ${response.status}` });
  }
}
