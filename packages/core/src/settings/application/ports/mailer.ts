import type { Result } from '../../../shared';

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Nombre del remitente; la dirección la fija el entorno (dominio verificado). */
  readonly fromName?: string | undefined;
  readonly replyTo?: string | undefined;
}

export type MailerError =
  /** Falta la configuración del proveedor (API key o remitente) en el entorno. */
  | { readonly type: 'MailNotConfigured' }
  /** El proveedor rechazó el envío (remitente no verificado, destinatario inválido). */
  | { readonly type: 'MailRejected'; readonly reason: string }
  /** El proveedor no respondió o falló: se puede reintentar más tarde. */
  | { readonly type: 'MailUnavailable' };

/** Envío de emails de salida (Resend). */
export interface Mailer {
  send(email: OutgoingEmail): Promise<Result<void, MailerError>>;
}
