/**
 * Lo que pidió quien contactó desde el aviso del portal:
 * - `message`: escribió una consulta.
 * - `call_me`: pidió que lo llamen.
 * - `visit`: pidió agendar una visita.
 * - `appraisal`: pidió una tasación.
 * - `contact_data`: quiso ver el teléfono de la inmobiliaria.
 * - `whatsapp`: quiso ver el WhatsApp de la inmobiliaria.
 * - `other`: otro tipo que el portal sume.
 */
export const PORTAL_LEAD_KINDS = [
  'message',
  'call_me',
  'visit',
  'appraisal',
  'contact_data',
  'whatsapp',
  'other',
] as const;

export type PortalLeadKind = (typeof PORTAL_LEAD_KINDS)[number];

/** Un contacto que llegó por un aviso del portal, como lo informa el portal. */
export interface PortalLead {
  /** El ID del contacto en el portal: con el canal, identifica la consulta. */
  readonly externalId: string;
  readonly kind: PortalLeadKind;
  readonly receivedAt: Date | undefined;
  readonly name: string | undefined;
  readonly email: string | undefined;
  readonly phone: string | undefined;
  readonly message: string | undefined;
  /** El código del aviso con que lo maneja Norde, si es uno suyo (publicado o vinculado). */
  readonly listingCode: string | undefined;
  /**
   * La unidad, si el contacto llegó por una unidad de un emprendimiento publicado por Norde: el
   * conector traduce el código con que la manda al portal.
   */
  readonly unitPropertyId: string | undefined;
}

/** El texto de la consulta cuando la persona no escribió nada: qué pidió. */
const KIND_MESSAGES: Readonly<Record<PortalLeadKind, string>> = {
  message: 'Consulta desde el aviso.',
  call_me: 'Pidió que lo llamen.',
  visit: 'Pidió agendar una visita.',
  appraisal: 'Pidió una tasación.',
  contact_data: 'Quiso ver el teléfono de la inmobiliaria.',
  whatsapp: 'Quiso ver el WhatsApp de la inmobiliaria.',
  other: 'Contacto desde el aviso.',
};

/** Los portales mandan "–" o "ANONYMOUS" cuando no hay dato. */
const PLACEHOLDERS = new Set(['', '-', '–', '—', 'anonymous', 'anonimo', 'anónimo']);

function meaningful(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined) return undefined;
  return PLACEHOLDERS.has(trimmed.toLowerCase()) ? undefined : trimmed;
}

/** Lo que entra a la bandeja de una consulta del portal. */
export interface PortalLeadInquiry {
  readonly externalId: string;
  readonly receivedAt: Date | undefined;
  readonly name: string | undefined;
  readonly email: string | undefined;
  readonly phone: string | undefined;
  readonly message: string;
}

/**
 * La consulta que entra a la bandeja, o `undefined` si el contacto no trae cómo contactar a la
 * persona (un anónimo que solo tocó "Ver teléfono"): esos no entran. Sin texto, el mensaje dice
 * qué pidió.
 */
export function leadInquiry(lead: PortalLead): PortalLeadInquiry | undefined {
  const email = meaningful(lead.email);
  const phone = meaningful(lead.phone);
  if (email === undefined && phone === undefined) return undefined;
  return {
    externalId: lead.externalId,
    receivedAt: lead.receivedAt,
    name: meaningful(lead.name),
    email,
    phone,
    message: meaningful(lead.message) ?? KIND_MESSAGES[lead.kind],
  };
}
