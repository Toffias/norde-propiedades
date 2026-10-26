# ADR 0046: Privacidad y tope de gasto del agente de IA

- **Estado**: aceptada
- **Fecha**: 2026-10-25
- **Complementa**: ADR 0009 (agent-kit sobre el OpenAI Agents SDK) y ADR 0037 (chat del sitio).

## Contexto

La revisión del agente (#150, #151) encontró tres huecos: OpenAI guardaba las conversaciones (la Responses API lo hace por defecto), no había ningún filtro antes del modelo más allá del prompt, y el único tope de gasto era la cantidad de respuestas por día, que no dice cuánta plata se gastó.

## Decisión

- **`store: false`** en todos los turnos (`@norde/agent-kit`). Para no perder el razonamiento entre llamadas a tools, se pide `reasoning.encrypted_content` y viaja cifrado en la memoria. Los ítems de razonamiento de turnos viejos se descartan al compactar la memoria.
- **Moderación de entrada**: `omni-moderation-latest` (sin costo) antes de cada turno, implementada en `@norde/infra` (`openAIModeration`) y recibida por el kit como una función. Si frena el mensaje, no se llama al modelo y se responde un texto fijo. Si la API falla, el mensaje pasa y se loguea el error (el prompt sigue teniendo sus límites).
- **Tope de gasto en USD** (`DailyBudget` en `apps/agent`):
  - Suma el costo estimado de cada turno con los precios del modelo por variable de entorno, contando aparte los tokens cacheados.
  - Ventana móvil de 24 h, compartida por los dos canales.
  - Vive en memoria, como el breaker: el agente corre en una sola instancia y un reinicio lo pone en cero.
  - Sin `AGENT_DAILY_BUDGET_USD` solo mide.

## Consecuencias

- La supresión de un cliente ya no deja copias de sus conversaciones en OpenAI (salvo la retención de 30 días por abuso que OpenAI aplica a todas las cuentas, que solo se evita con Zero Data Retention: es un trámite de la cuenta de OpenAI de Norde).
- La memoria guardada pesa más por el razonamiento cifrado del último turno, pero la compactación quita el de los turnos anteriores.
- El tope en memoria es una red de seguridad, no contabilidad: el gasto real se ve en el panel de OpenAI. Si el agente pasa a varias instancias, el tope tiene que salir de la base (suma del uso guardado en `conversation_messages`).
