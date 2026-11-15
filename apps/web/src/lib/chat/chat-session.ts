import { createHmac, timingSafeEqual } from 'node:crypto';

// La cookie de la sesión del chat (`norde_chat`) va firmada: `<uuid>.<HMAC>`. Sin firma, cualquiera
// mandaba un UUID nuevo en cada mensaje y el agente le abría una sesión con los contadores en cero,
// esquivando el tope de sesiones nuevas por IP.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Separa esta firma de cualquier otro uso del mismo secreto. */
const PURPOSE = 'norde-web-chat-session:';

function signatureOf(sessionId: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${PURPOSE}${sessionId}`).digest();
}

/** El valor de la cookie para una sesión. */
export function signChatSession(sessionId: string, secret: string): string {
  return `${sessionId}.${signatureOf(sessionId, secret).toString('base64url')}`;
}

/** La sesión de la cookie si la firmamos nosotros; `undefined` si falta, está alterada o es vieja (sin firma). */
export function verifyChatSession(value: string | undefined, secret: string): string | undefined {
  const [sessionId, signature, ...rest] = value?.split('.') ?? [];
  if (sessionId === undefined || signature === undefined || rest.length > 0) return undefined;
  if (!UUID.test(sessionId)) return undefined;
  const received = Buffer.from(signature, 'base64url');
  const expected = signatureOf(sessionId, secret);
  return received.length === expected.length && timingSafeEqual(received, expected)
    ? sessionId
    : undefined;
}

export type ChatSessionResolution =
  | { readonly kind: 'existing'; readonly sessionId: string }
  /** Hay que guardar `cookie` en el navegador. */
  | { readonly kind: 'created'; readonly sessionId: string; readonly cookie: string }
  /** Ese IP ya abrió demasiadas sesiones hoy. */
  | { readonly kind: 'limited' };

/**
 * La sesión del visitante: la de su cookie si es válida; si no, una nueva, solo si el límite de
 * sesiones nuevas lo deja (`allowNew` suma una).
 */
export function resolveChatSession(input: {
  readonly cookie: string | undefined;
  readonly secret: string;
  readonly allowNew: () => boolean;
  readonly newId: () => string;
}): ChatSessionResolution {
  const current = verifyChatSession(input.cookie, input.secret);
  if (current !== undefined) return { kind: 'existing', sessionId: current };
  if (!input.allowNew()) return { kind: 'limited' };
  const sessionId = input.newId();
  return { kind: 'created', sessionId, cookie: signChatSession(sessionId, input.secret) };
}
