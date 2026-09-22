import { AgentRunner, type AgentRunnerOptions } from '@norde/agent-kit';

import { AGENT_NAME } from './instructions/base';
import { buildInstructions } from './instructions/build-instructions';
import { offerButtonsTool } from './tools/offer-buttons.tool';
import { getPropertyTool, showPhotoTool } from './tools/property-detail.tools';
import { registerClientTool } from './tools/register-client.tool';
import { searchPropertiesTool } from './tools/search-properties.tool';
import type { AssistantToolDeps } from './tools/tool-deps';
import type { CustomerTurnContext } from './turn-context';

export type CustomerAssistant = AgentRunner<CustomerTurnContext>;

/** El agente que atiende clientes, igual en todos los canales (cambia el bloque de instrucciones). */
export function createCustomerAssistant(
  options: {
    readonly model: AgentRunnerOptions<CustomerTurnContext>['model'];
    readonly maxMemoryItems: number;
    readonly onToolError: (tool: string, error: unknown) => void;
  } & AssistantToolDeps,
): CustomerAssistant {
  return new AgentRunner<CustomerTurnContext>({
    name: AGENT_NAME,
    model: options.model,
    instructions: buildInstructions,
    tools: [
      searchPropertiesTool(options),
      getPropertyTool(options),
      showPhotoTool(options),
      offerButtonsTool(),
      registerClientTool(options),
    ],
    maxMemoryItems: options.maxMemoryItems,
    onToolError: options.onToolError,
  });
}
