// Cuándo conviene que el bot responda. En WhatsApp cada mensaje enviado se cobra, así que
// estas reglas también son control de costos.

/** Mensajes que no ameritan respuesta: solo se registran. */
const ACKNOWLEDGEMENT_ONLY =
  /^(ok|oka|okey|dale|listo|gracias|muchas gracias|genial|perfecto|buenísimo|buenisimo|joya|bárbaro|barbaro|de nada|👍|🙏|👌|❤️)[.!\s]*$/iu;

export function isAcknowledgementOnly(text: string): boolean {
  return ACKNOWLEDGEMENT_ONLY.test(text.trim());
}

/** Reentregas tardías del canal: responderlas horas después confunde al cliente. */
export function isStale(sentAt: Date, now: Date, maxAgeMs: number): boolean {
  return now.getTime() - sentAt.getTime() > maxAgeMs;
}

export interface UsageLimits {
  /** Mensajes entrantes de un contacto en la última hora. */
  readonly perContactPerHour: number;
  /** Mensajes entrantes de un contacto en las últimas 24 horas. */
  readonly perContactPerDay: number;
  /** Mensajes salientes del canal en las últimas 24 horas (tope de gasto). */
  readonly outboundPerDay: number;
}

export interface UsageCounts {
  readonly contactLastHour: number;
  readonly contactLastDay: number;
  readonly outboundLastDay: number;
}

export type UsageDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'contact_hour' | 'contact_day' | 'channel_day' };

/** Los conteos de entrantes ya incluyen el mensaje actual. */
export function evaluateUsage(counts: UsageCounts, limits: UsageLimits): UsageDecision {
  if (counts.outboundLastDay >= limits.outboundPerDay) {
    return { allowed: false, reason: 'channel_day' };
  }
  if (counts.contactLastDay > limits.perContactPerDay) {
    return { allowed: false, reason: 'contact_day' };
  }
  if (counts.contactLastHour > limits.perContactPerHour) {
    return { allowed: false, reason: 'contact_hour' };
  }
  return { allowed: true };
}
