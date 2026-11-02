// Cuándo conviene que el bot responda. En WhatsApp cada mensaje enviado se cobra, así que
// estas reglas también son control de costos.

/** Cierres que nunca ameritan respuesta: solo se registran. */
const CLOSING = /^(gracias|muchas gracias|de nada|🙏|❤️)[.!\s]*$/iu;

/** Asentimientos: no ameritan respuesta, salvo que contesten una pregunta del bot ("¿te registro?"). */
const AGREEMENT =
  /^(ok|oka|okey|dale|listo|genial|perfecto|buenísimo|buenisimo|joya|bárbaro|barbaro|👍|👌)[.!\s]*$/iu;

/**
 * Si el mensaje es solo un acuse ("gracias", "ok") y no hace falta responder. Un "dale" después de
 * una pregunta del bot es una respuesta: `afterQuestion` lo deja pasar al agente.
 */
export function isAcknowledgementOnly(text: string, afterQuestion = false): boolean {
  const trimmed = text.trim();
  return CLOSING.test(trimmed) || (!afterQuestion && AGREEMENT.test(trimmed));
}

/** La última respuesta enviada en la conversación, como quedó en el registro de mensajes. */
export interface LastReply {
  readonly kind: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly channelMessageId?: string | undefined;
}

/**
 * El contacto tocó un botón de un mensaje anterior a la última respuesta: su texto ("Sí", "Ver
 * más") no contesta lo último que se le preguntó. Sin el dato del canal, se asume que es actual.
 */
export function isOldButtonTap(
  message: { readonly kind: string; readonly replyTo?: string | undefined },
  last: LastReply | undefined,
): boolean {
  if (message.kind !== 'button' || message.replyTo === undefined) return false;
  return last?.channelMessageId !== message.replyTo;
}

/** Si la última respuesta le preguntó algo al contacto: ofreció botones o terminó en pregunta. */
export function repliedWithQuestion(last: LastReply | undefined): boolean {
  if (!last) return false;
  if (last.kind === 'buttons') return true;
  const text = last.body.text ?? last.body.caption;
  return typeof text === 'string' && text.includes('?');
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
