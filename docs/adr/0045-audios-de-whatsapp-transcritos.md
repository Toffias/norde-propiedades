# ADR 0045: Audios de WhatsApp transcritos con OpenAI

- **Estado**: aceptada
- **Fecha**: 2026-10-25
- **Complementa**: ADR 0009 (agent-kit sobre el OpenAI Agents SDK).

## Contexto

En Argentina buena parte de los mensajes de WhatsApp son audios. Hasta ahora el agente contestaba "solo puedo leer mensajes de texto" y el cliente tenía que volver a escribir (#150).

## Decisión

- **Transcribir antes de registrar**: el handler de WhatsApp (`apps/agent`) llama al caso de uso `TranscribeAudioMessage` (módulo `conversations`) por cada audio del lote. El texto entra a `ReceiveInboundMessages` como un mensaje `audio`, y el core le pasa al agente `(audio) <texto>`, así sabe que puede haber errores de transcripción.
- **Puerto `AudioTranscriber`** en el core, implementado en `@norde/infra` por `WhatsAppAudioTranscriber`:
  - Descarga el archivo de la Graph API de Meta con el token del canal.
  - Lo manda a `POST /v1/audio/transcriptions` de OpenAI (`OPENAI_TRANSCRIBE_MODEL`, por defecto `gpt-4o-mini-transcribe`, idioma `es`), con `fetch` y sin sumar el SDK `openai`.
  - Rechaza audios de más de 5 MB (`AudioTooLarge`). Una nota de voz de un par de minutos pesa menos de 1 MB.
- **Si no se puede transcribir** (archivo grande, silencio, error de Meta o de OpenAI), el mensaje queda `unsupported` y se responde el aviso de siempre. Los errores de las APIs se loguean en el handler.
- **No se guarda el audio**: solo la transcripción, en el registro de mensajes, como cualquier texto del contacto.

## Consecuencias

- El audio del cliente viaja a OpenAI, igual que sus mensajes escritos. La política de privacidad tiene que mencionarlo junto con el resto del procesamiento del agente (ver #151).
- Costo: la transcripción se cobra por minuto de audio y es chica frente al turno del agente. Un audio reenviado por Meta se transcribe de nuevo antes de descartarse como duplicado, lo que es poco frecuente.
- La supresión de un cliente borra las transcripciones con el resto de sus mensajes. En Meta y OpenAI rigen sus propias retenciones.
- El chat del sitio no recibe audios: no cambia.
