import type { ReplyPlan } from '@norde/core/conversations';

/** Los avisos del plan del core, más el de agente no disponible (breaker abierto o tope de gasto). */
type Notice = Extract<ReplyPlan, { action: 'notice' }>['notice'] | 'agent_unavailable';

export const NOTICE_TEXT: Readonly<Record<Notice, string>> = {
  agent_unavailable:
    'Perdón, en este momento no puedo responderte. Volvé a escribirme en un rato y seguimos.',
  unsupported_content:
    'Por ahora solo puedo leer mensajes de texto y audios. ¿Me contás qué estás buscando?',
  // No promete que un asesor revise: el plan `contact_limit` no avisa a nadie (#151).
  contact_limit:
    'Recibí muchos mensajes seguidos y necesito frenar un rato. Escribime más tarde y seguimos. ¡Gracias por la paciencia!',
};

/** Con más avisos que esto en memoria, se descartan los que ya salieron del período. */
const PRUNE_ABOVE = 1000;

/** Los avisos se mandan como máximo una vez por período por contacto (cada uno se cobra). */
export class NoticeThrottle {
  readonly #lastSent = new Map<string, number>();

  constructor(
    private readonly cooldownMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  allow(notice: Notice, contact: string): boolean {
    const key = `${notice}:${contact}`;
    const now = this.now();
    // Sin purga, cada contacto que alguna vez recibió un aviso quedaría en memoria para siempre.
    if (this.#lastSent.size > PRUNE_ABOVE) {
      for (const [sent, at] of this.#lastSent) {
        if (now - at >= this.cooldownMs) this.#lastSent.delete(sent);
      }
    }
    const last = this.#lastSent.get(key);
    if (last !== undefined && now - last < this.cooldownMs) return false;
    this.#lastSent.set(key, now);
    return true;
  }
}
