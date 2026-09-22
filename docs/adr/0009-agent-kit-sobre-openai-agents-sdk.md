# ADR 0009: `@norde/agent-kit` envuelve el OpenAI Agents SDK, sin un puerto `LlmGateway` en el core

- **Estado**: aceptada
- **Fecha**: 2026-09-22

## Contexto

`docs/arquitectura.md` proponía que el runner de agentes llamara al LLM a través de un puerto `LlmGateway` del core, implementado en infra con OpenAI.

Al portar el MVP (APZ-WP-BOT) aparecieron dos problemas con esa idea:

- **El bucle de tools es del SDK.** El Agents SDK decide qué tool llamar, las ejecuta, reintenta y arma el historial. Un puerto genérico `LlmGateway` obligaría a reescribir ese bucle o a esconder el SDK detrás de una interfaz que calca la suya.
- **El core no usa el LLM.** Ningún caso de uso necesita hablar con un modelo. El agente es presentación: interpreta al cliente y llama casos de uso. Un puerto en el core sería una dependencia sin consumidores.

## Decisión

- `@norde/agent-kit` es el **único** paquete que importa `@openai/agents`. Expone:
  - `AgentRunner`: corre un turno.
  - `defineTool`: define tools con Zod.
  - `trimMemory`: recorta la memoria.
  - En `@norde/agent-kit/testing`, `ScriptedModel`: permite probar turnos sin llamar a OpenAI.
- Las apps definen instrucciones y tools, y las tools llaman casos de uso. **No importan el SDK.**
- La memoria del agente (los ítems del historial del SDK) es **opaca** para el core. El módulo `conversations` la guarda, la recorta y la reinicia, pero no la interpreta.
- Cambiar de proveedor de LLM implica reescribir `agent-kit`, no el core ni las tools.

## Consecuencias

- Se reutiliza tal cual lo aprendido en el MVP: techo de tokens con razonamiento, esfuerzo bajo, recorte seguro del historial y timeouts.
- Los turnos completos se prueban con `ScriptedModel` y los fakes en memoria del core.
- El agente de soporte interno de `apps/gestion` va a usar el mismo `agent-kit`.
- Si algún caso de uso llegara a necesitar un LLM (por ejemplo, resumir una conversación para el panel), se define entonces un puerto específico en su módulo.
