import type { ConversationChannel } from '../domain/conversation';
import type { UsageLimits } from '../domain/reply-policy';

/** Parámetros de negocio de las conversaciones. Los valores llegan de la configuración de la app. */
export interface ConversationPolicy {
  /** Inactividad tras la cual la conversación arranca de cero (MVP: 24 h). */
  readonly idleResetAfterMs: number;
  /** Mensajes más viejos que esto no se responden (reentregas tardías). */
  readonly maxInboundAgeMs: number;
  /** Largo máximo de cada mensaje que se registra y que ve el agente. */
  readonly maxInboundTextChars: number;
  /** Topes por canal. Un canal sin topes no se limita. */
  readonly usageLimits: Readonly<Partial<Record<ConversationChannel, UsageLimits>>>;
}
