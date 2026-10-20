/** Canales por los que un cliente se contacta. Es clave para los reportes de origen. */
export const CONTACT_CHANNELS = [
  'whatsapp',
  'web_chat',
  'web_form',
  'mercadolibre',
  'zonaprop',
  'argenprop',
  'referral',
  'phone_call',
  'office',
  // Portales que solo llegan desde la migración de Tokko (#17).
  'icasas',
  'properati',
  'olx',
  'liderprop',
  'enbuenosaires',
  'reporte_inmobiliario',
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/** Identidad del cliente en un canal: teléfono en WhatsApp, sesión en web chat, ID en un portal. */
export interface ClientChannel {
  readonly channel: ContactChannel;
  readonly externalId: string;
  readonly firstContactAt: Date;
  readonly lastContactAt: Date;
}
