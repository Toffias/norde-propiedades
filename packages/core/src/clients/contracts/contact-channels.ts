/** Replica `CONTACT_CHANNELS` del dominio: por dónde llegó un contacto. */
export const CONTACT_CHANNEL_VALUES = [
  'whatsapp',
  'web_chat',
  'web_form',
  'mercadolibre',
  'zonaprop',
  'argenprop',
  'referral',
  'phone_call',
  'office',
] as const;
export type ContactChannelValue = (typeof CONTACT_CHANNEL_VALUES)[number];
