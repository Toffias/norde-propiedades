import { BUSINESS } from '../constants/business';

/** Link a WhatsApp con un mensaje armado, o `null` si Norde todavía no confirmó el número. */
export function whatsappHref(
  text: string,
  phone: string | null = BUSINESS.whatsapp,
): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
