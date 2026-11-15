# ADR 0055: Tope de gasto del agente obligatorio

- **Estado**: aceptada
- **Fecha**: 2026-11-14
- **Modifica**: ADR 0046 (privacidad y tope de gasto del agente de IA), en el punto "Sin `AGENT_DAILY_BUDGET_USD` solo mide".

## Contexto

La auditoría del repo (#222) encontró huecos en el control de gasto del agente: el presupuesto diario era opcional, los turnos fallidos (que pueden hacer hasta 8 llamadas al modelo) no se sumaban y las transcripciones de audio tampoco.

## Decisión

- `AGENT_DAILY_BUDGET_USD` siempre tiene un valor: si falta o está vacío, vale **10 USD**. El agente ya no corre "solo midiendo".
- Se suma al presupuesto lo que gasta un turno **fallido** (el uso que el SDK registró hasta el error) y cada **transcripción** de audio, con un precio fijo estimado (`OPENAI_PRICE_PER_AUDIO_USD`, 0,003 USD por defecto).
- Con el presupuesto agotado tampoco se transcriben audios.
- El presupuesto sigue en memoria y se reinicia con el proceso. Persistirlo (sumar el uso guardado en `conversation_messages`, más los turnos fallidos y las transcripciones) queda pendiente: necesita columnas o una tabla nueva.

## Consecuencias

- Un despliegue sin la variable arranca con el tope de 10 USD por día; si Norde necesita más, se sube en el `.env`.
- Tras un reinicio el contador vuelve a cero: en el peor caso, un día gasta el tope más de una vez.
