'use server';

import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';

import { getEnv } from '../../config/env';
import { getLogger } from '../../config/logger';
import { getContainer, type WebChatReply } from '../../container';
import { clientRateKey } from '../client-ip';
import { createRateLimiter } from '../rate-limit';

import { resolveChatSession } from './chat-session';
import { ChatMessageInputSchema, type ChatActionResult, type ChatReply } from './chat-contract';
import { chatListingHref } from './listing-link';

/**
 * Sesión anónima del visitante: identifica su conversación con el agente (ADR 0037). Va firmada con
 * `PAYLOAD_SECRET` (ver `chat-session.ts`).
 */
const SESSION_COOKIE = 'norde_chat';
const SESSION_MAX_AGE_S = 30 * 24 * 3600;

const DAY_MS = 24 * 3_600_000;

/**
 * Mensajes por IP cada 10 minutos (`CHAT_MESSAGES_PER_10_MIN`). El agente suma sus propios límites
 * por sesión. Se arma al primer mensaje: el módulo también se carga en el build, sin entorno.
 */
let allowShortTerm: ((key: string) => boolean) | undefined;
function allow(ip: string): boolean {
  allowShortTerm ??= createRateLimiter(getEnv().CHAT_MESSAGES_PER_10_MIN, () => Date.now());
  return allowShortTerm(ip);
}
/** Mensajes por IP por día: cada uno es un turno del LLM. */
const allowToday = createRateLimiter(150, () => Date.now(), DAY_MS);
/**
 * Conversaciones nuevas por IP por día. "Nueva conversación" crea otra sesión con contadores en
 * cero en el agente: sin este tope, se esquivarían sus límites por sesión.
 */
const allowNewSession = createRateLimiter(10, () => Date.now(), DAY_MS);

const UNAVAILABLE =
  'El asistente no está disponible en este momento. Probá de nuevo en unos minutos.';
const BUSY_RESULT: ChatActionResult = {
  status: 'error',
  message:
    'Recibimos muchos mensajes seguidos. Esperá unos minutos y volvé a escribir, o seguí la consulta por WhatsApp.',
  busy: true,
};

/**
 * La sesión del visitante, de su cookie firmada; si no tiene (o no es válida), se crea una nueva.
 * `undefined` si ese IP ya abrió demasiadas hoy.
 */
async function sessionId(ip: string): Promise<string | undefined> {
  const store = await cookies();
  const env = getEnv();
  const session = resolveChatSession({
    cookie: store.get(SESSION_COOKIE)?.value,
    secret: env.PAYLOAD_SECRET,
    allowNew: () => allowNewSession(ip),
    newId: randomUUID,
  });
  switch (session.kind) {
    case 'existing':
      return session.sessionId;
    case 'limited':
      return undefined;
    case 'created':
      store.set(SESSION_COOKIE, session.cookie, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
        path: '/',
        maxAge: SESSION_MAX_AGE_S,
      });
      return session.sessionId;
  }
}

function toChatReply({ listing, ...reply }: WebChatReply): ChatReply {
  return { ...reply, listingUrl: listing ? chatListingHref(listing) : null };
}

/** Server Action del widget: manda el mensaje al agente y devuelve su respuesta. */
export async function sendChatMessage(input: unknown): Promise<ChatActionResult> {
  const parsed = ChatMessageInputSchema.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'No pudimos leer tu mensaje.' };

  const chat = getContainer().chat;
  if (!chat) return { status: 'error', message: UNAVAILABLE };
  const ip = await clientRateKey();
  if (!allow(ip) || !allowToday(ip)) return BUSY_RESULT;
  const session = await sessionId(ip);
  if (!session) return BUSY_RESULT;

  const logger = getLogger().child({ component: 'site-chat' });
  try {
    const outcome = await chat.send({ sessionId: session, ...parsed.data });
    switch (outcome.kind) {
      case 'reply':
        return { status: 'ok', reply: outcome.reply && toChatReply(outcome.reply) };
      case 'busy':
        return BUSY_RESULT;
      case 'unavailable':
        return { status: 'error', message: UNAVAILABLE };
    }
  } catch (error) {
    logger.error({ err: error }, 'Chat message could not be sent');
    return { status: 'error', message: UNAVAILABLE };
  }
}

/** "Nueva conversación": olvida la sesión, así el próximo mensaje arranca otra. */
export async function resetChatSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
