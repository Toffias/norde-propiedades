import type { ContactChannel } from './contact-channel';

/**
 * De dónde vino una consulta, agrupado para los indicadores de la bandeja: los dos portales, el
 * agente de IA de la web, el bot de WhatsApp y todo lo demás junto.
 */
export const INQUIRY_SOURCES = [
  'mercadolibre',
  'zonaprop',
  'web_chat',
  'whatsapp',
  'other',
] as const;

export type InquirySource = (typeof INQUIRY_SOURCES)[number];

const OWN_SOURCES: ReadonlySet<ContactChannel> = new Set<ContactChannel>([
  'mercadolibre',
  'zonaprop',
  'web_chat',
  'whatsapp',
]);

function hasOwnSource(channel: ContactChannel): channel is ContactChannel & InquirySource {
  return OWN_SOURCES.has(channel);
}

export function inquirySourceOf(channel: ContactChannel): InquirySource {
  return hasOwnSource(channel) ? channel : 'other';
}

/** Suma los totales por canal en los grupos de origen; los que no llegaron quedan en cero. */
export function countBySource(
  byChannel: ReadonlyMap<ContactChannel, number>,
): Readonly<Record<InquirySource, number>> {
  const totals: Record<InquirySource, number> = {
    mercadolibre: 0,
    zonaprop: 0,
    web_chat: 0,
    whatsapp: 0,
    other: 0,
  };
  for (const [channel, total] of byChannel) totals[inquirySourceOf(channel)] += total;
  return totals;
}
