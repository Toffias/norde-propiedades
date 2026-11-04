/** Lo que va en el email que pide confirmar una suscripción desde la web (#208). */
export interface SubscriptionConfirmationContent {
  readonly companyName: string;
  readonly firstName: string | undefined;
  /** "Departamentos en venta en Palermo, hasta USD 150.000". */
  readonly searchSummary: string;
  /** "cada 3 días", "una vez por semana", "una vez por mes". */
  readonly frequencyLabel: string;
  readonly confirmUrl: string;
  readonly expiresAt: Date;
}

export interface SubscriptionConfirmationEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** La plantilla del email de confirmación, con la marca de Norde. */
export interface SubscriptionConfirmationEmails {
  compose(content: SubscriptionConfirmationContent): SubscriptionConfirmationEmail;
}
