import type {
  ClientListingSummary,
  PROPERTY_REACTION_VALUES,
  PROPERTY_SEND_CHANNEL_VALUES,
} from '../../contracts';

/** Un token nuevo para el link de un envío y su hash, que es lo único que se guarda. */
export interface IssuedSharedListingToken {
  readonly token: string;
  readonly hash: string;
}

/** Tokens de los links públicos: al azar, y se guardan hasheados. */
export interface SharedListingTokens {
  issue(): IssuedSharedListingToken;
  hashOf(token: string): string;
}

/** Lo que el sitio público muestra de las propiedades (módulo properties). */
export interface PublicListings {
  /** De estas propiedades, las que el sitio no muestra (sin publicar en la web o dadas de baja). */
  unlisted(propertyIds: readonly string[]): Promise<readonly string[]>;
}

/** Un envío al contacto tal como sale de la base: el estado lo decide el caso de uso. */
export interface ClientSendItem {
  readonly id: string;
  readonly channel: (typeof PROPERTY_SEND_CHANNEL_VALUES)[number];
  readonly sentAt: Date;
  readonly sentBy: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | undefined;
  readonly properties: readonly {
    readonly id: string;
    readonly reaction: (typeof PROPERTY_REACTION_VALUES)[number] | undefined;
  }[];
  readonly firstOpenedAt: Date | undefined;
  readonly openCount: number;
}

/** Los envíos de un contacto, los más nuevos primero. */
export interface ClientSendsQuery {
  sends(criteria: {
    readonly clientId: string;
    readonly direction: 'asc' | 'desc';
    readonly offset: number;
    readonly limit: number;
  }): Promise<{ readonly items: readonly ClientSendItem[]; readonly total: number }>;
}

/** Lo que va en el email de un envío. */
export interface SharedListingEmailContent {
  readonly companyName: string;
  readonly advisorName: string | undefined;
  /** El mensaje del asesor; sin mensaje, uno por defecto. */
  readonly message: string | undefined;
  readonly url: string;
  readonly expiresAt: Date;
  readonly listings: readonly ClientListingSummary[];
}

export interface ComposedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** La plantilla del email de un envío, con la marca de Norde. */
export interface SharedListingEmails {
  compose(content: SharedListingEmailContent): ComposedEmail;
}
