import type { ReplyPlan } from '@norde/core/conversations';

/** Los avisos del plan del core, más el de agente no disponible (breaker abierto o tope de gasto). */
type Notice = Extract<ReplyPlan, { action: 'notice' }>['notice'] | 'agent_unavailable';

export const NOTICE_TEXT: Readonly<Record<Notice, string>> = {
  agent_unavailable:
    'Perdón, en este momento no puedo responderte. Volvé a escribirme en un rato y seguimos.',
  unsupported_content:
    'Por ahora solo puedo leer mensajes de texto y audios. ¿Me contás qué estás buscando?',
  contact_limit:
    'Recibí muchos mensajes seguidos. Para seguir ayudándote, un asesor va a revisar la conversación. ¡Gracias por la paciencia!',
};

/** Los avisos se mandan como máximo una vez por período por contacto (cada uno se cobra). */
export class NoticeThrottle {
  readonly #lastSent = new Map<string, number>();

  constructor(
    private readonly cooldownMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  allow(notice: Notice, contact: string): boolean {
    const key = `${notice}:${contact}`;
    const last = this.#lastSent.get(key);
    const now = this.now();
    if (last !== undefined && now - last < this.cooldownMs) return false;
    this.#lastSent.set(key, now);
    return true;
  }
}
