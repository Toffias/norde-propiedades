import {
  AgentRunner,
  type AgentRunnerOptions,
  type AgentTurnResult,
  type InputModeration,
} from '@norde/agent-kit';

import { applyCustomerReply, CustomerReplySchema } from './customer-reply';
import { AGENT_NAME } from './instructions/base';
import { buildInstructions } from './instructions/build-instructions';
import { unverifiedAmounts } from './price-guard';
import { compactToolOutput } from './tool-memory';
import { getPropertyTool } from './tools/property-detail.tools';
import { registerClientTool } from './tools/register-client.tool';
import { searchPropertiesTool } from './tools/search-properties.tool';
import type { AssistantToolDeps } from './tools/tool-deps';
import type { CustomerTurnContext } from './turn-context';

/** Todas las conversaciones comparten el prefijo del pedido: tools e instrucciones fijas. */
const PROMPT_CACHE_KEY = 'norde-customer-assistant';

/** Respuesta fija cuando la moderación frena el mensaje: no se llama al modelo. */
export const MODERATED_TEXT =
  'Solo puedo ayudarte con propiedades de Norde. ¿Qué estás buscando: comprar, alquilar o tasar?';

type CustomerAssistantOptions = {
  readonly model: AgentRunnerOptions<CustomerTurnContext>['model'];
  readonly maxMemoryItems: number;
  readonly onToolError: (tool: string, error: unknown) => void;
  readonly moderation?: InputModeration | undefined;
  /** Montos de la respuesta que no salieron de las tools ni del cliente (posible invento). */
  readonly onUnverifiedAmounts?: ((amounts: readonly string[]) => void) | undefined;
} & AssistantToolDeps;

/**
 * El agente que atiende clientes, igual en todos los canales (cambia el bloque de instrucciones).
 * Termina cada turno con una respuesta estructurada (`CustomerReplySchema`): el texto, los botones
 * y la foto quedan en el turno, sin tools que solo marcan cómo responder.
 */
export class CustomerAssistant {
  readonly #runner: AgentRunner<CustomerTurnContext>;

  constructor(private readonly options: CustomerAssistantOptions) {
    this.#runner = new AgentRunner<CustomerTurnContext>({
      name: AGENT_NAME,
      model: options.model,
      instructions: buildInstructions,
      tools: [searchPropertiesTool(options), getPropertyTool(options), registerClientTool(options)],
      outputSchema: CustomerReplySchema,
      promptCacheKey: PROMPT_CACHE_KEY,
      maxMemoryItems: options.maxMemoryItems,
      compactToolOutput,
      ...(options.moderation ? { moderation: options.moderation } : {}),
      onToolError: options.onToolError,
    });
  }

  async run(
    input: Parameters<AgentRunner<CustomerTurnContext>['run']>[0],
  ): Promise<AgentTurnResult> {
    const turn = await this.#runner.run(input);
    if (!turn.ok) return turn;
    if (turn.flagged) return { ...turn, text: MODERATED_TEXT };
    try {
      const text = await applyCustomerReply(turn.output, input.context, this.options);
      if (text) {
        // Lo que vio el turno: la memoria sin la respuesta final.
        const amounts = unverifiedAmounts(text, turn.memory.slice(0, -1));
        if (amounts.length > 0) this.options.onUnverifiedAmounts?.(amounts);
      }
      return { ...turn, text };
    } catch (error) {
      return { ok: false, error };
    }
  }
}

export function createCustomerAssistant(options: CustomerAssistantOptions): CustomerAssistant {
  return new CustomerAssistant(options);
}
