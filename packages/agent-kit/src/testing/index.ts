// Helpers para testear agentes sin llamar a OpenAI (`@norde/agent-kit/testing`).
// `ScriptedModel` responde lo que se le programe: llamadas a tools y mensajes finales.

export {
  assistantMessage,
  functionCall,
  modelError,
  ScriptedModel,
} from '@openai/agents-core/testing';
