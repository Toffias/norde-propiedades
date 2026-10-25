import type { AgentToolCall } from '@norde/agent-kit';

/** Argumentos que pueden traer datos personales: no van a los logs (Ley 25.326). */
const PERSONAL_KEYS = new Set(['name', 'email', 'phone', 'notes']);

/** Las tools del turno con sus argumentos, sin datos personales, para el log de depuración. */
export function toolCallsForLog(calls: readonly AgentToolCall[]) {
  return calls.map((call) => ({
    name: call.name,
    arguments:
      typeof call.arguments === 'object' && call.arguments !== null
        ? Object.fromEntries(
            Object.entries(call.arguments).map(([key, value]) => [
              key,
              PERSONAL_KEYS.has(key) && value !== null ? '[redacted]' : value,
            ]),
          )
        : '[unparsed]',
  }));
}
