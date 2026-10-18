'use server';

import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { getEnv } from '../../config/env';
import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';
import { clientIp } from '../client-ip';
import { createRateLimiter } from '../rate-limit';

import { ChatMessageInputSchema, type ChatActionResult } from './chat-contract';

/** Sesión anónima del visitante: identifica su conversación con el agente (ADR 0037). */
const SESSION_COOKIE = 'norde_chat';
const SESSION_MAX_AGE_S = 30 * 24 * 3600;

/** Mensajes por IP cada 10 minutos. El agente suma sus propios límites por sesión. */
const allow = createRateLimiter(20, () => Date.now());

const UNAVAILABLE =
  'El asistente no está disponible en este momento. Probá de nuevo en unos minutos.';
const BUSY = 'Recibimos muchos mensajes seguidos. Esperá unos minutos y volvé a escribir.';

/** La sesión del visitante; si no tiene (o no es válida), se crea una nueva. */
async function sessionId(): Promise<string> {
  const store = await cookies();
  const current = z.uuid().safeParse(store.get(SESSION_COOKIE)?.value);
  if (current.success) return current.data;

  const created = randomUUID();
  store.set(SESSION_COOKIE, created, {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
  return created;
}

/** Server Action del widget: manda el mensaje al agente y devuelve su respuesta. */
export async function sendChatMessage(input: unknown): Promise<ChatActionResult> {
  const parsed = ChatMessageInputSchema.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'No pudimos leer tu mensaje.' };

  const chat = getContainer().chat;
  if (!chat) return { status: 'error', message: UNAVAILABLE };
  if (!allow(await clientIp())) return { status: 'error', message: BUSY };

  const logger = getLogger().child({ component: 'site-chat' });
  try {
    const outcome = await chat.send({ sessionId: await sessionId(), ...parsed.data });
    switch (outcome.kind) {
      case 'reply':
        return { status: 'ok', reply: outcome.reply };
      case 'busy':
        return { status: 'error', message: BUSY };
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
