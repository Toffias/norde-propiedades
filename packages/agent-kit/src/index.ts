// API pública de @norde/agent-kit: runner de agentes de IA reutilizable (clientes, soporte interno).

export {
  AgentRunner,
  DEFAULT_FULL_MEMORY_TURNS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_REASONING_EFFORT,
  type AgentRunnerOptions,
  type AgentToolCall,
  type AgentTurnResult,
  type AgentTurnUsage,
  type ReasoningEffort,
} from './agent-runner';
export { defineTool, toToolOutput, type AgentTool } from './agent-tool';
export { compactMemory, trimMemory, type ToolOutputCompactor } from './memory';
export type { InputModeration } from './moderation';
