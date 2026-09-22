import {
  Agent,
  OpenAIProvider,
  RunContext,
  Runner,
  tool,
  user,
  type AgentInputItem,
  type Model,
} from '@openai/agents';

import { toToolOutput, type AgentTool } from './agent-tool';
import { trimMemory } from './memory';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface AgentRunnerOptions<TContext> {
  readonly name: string;
  /** Modelo de OpenAI por nombre, o una instancia de `Model` (en tests, `ScriptedModel`). */
  readonly model: { readonly name: string; readonly apiKey: string } | { readonly instance: Model };
  /** Se arman en cada turno: pueden depender del contexto (canal, fecha, nombre). */
  readonly instructions: (context: TContext) => string;
  readonly tools: readonly AgentTool<TContext>[];
  /** Tope de ítems de memoria que se le pasan al modelo (recorte seguro, ver `trimMemory`). */
  readonly maxMemoryItems: number;
  /**
   * Techo de la respuesta completa, **razonamiento incluido**. Con un techo bajo el modelo
   * gasta el presupuesto pensando y termina sin responder (MVP: 700 fallaba siempre).
   */
  readonly maxOutputTokens?: number;
  /** El costo se acota con el esfuerzo de razonamiento, no con el techo de tokens. */
  readonly reasoningEffort?: ReasoningEffort;
  readonly maxTurns?: number;
  readonly timeoutMs?: number;
  /** Error inesperado dentro de una tool. El modelo recibe un error genérico y sigue. */
  readonly onToolError?: (toolName: string, error: unknown) => void;
}

export interface AgentTurnUsage {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type AgentTurnResult =
  | {
      readonly ok: true;
      /** Texto final del modelo. `undefined` si no escribió nada. */
      readonly text: string | undefined;
      /** Memoria para guardar: la anterior más este turno completo. */
      readonly memory: readonly unknown[];
      readonly usage: AgentTurnUsage;
      /** Nombres de las tools llamadas en el turno, en orden. */
      readonly toolCalls: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: unknown;
    };

export const DEFAULT_MAX_OUTPUT_TOKENS = 3000;
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';

/**
 * Corre un turno de un agente de IA sobre el OpenAI Agents SDK. Es el único lugar del
 * monorepo que conoce el SDK: las apps definen instrucciones y tools, y guardan la memoria.
 */
export class AgentRunner<TContext> {
  readonly #agent: Agent<TContext>;
  readonly #runner: Runner;

  constructor(private readonly options: AgentRunnerOptions<TContext>) {
    const model = 'instance' in options.model ? options.model.instance : options.model.name;
    this.#agent = new Agent<TContext>({
      name: options.name,
      model,
      instructions: (runContext) => options.instructions(runContext.context),
      tools: options.tools.map((t) => this.toSdkTool(t)),
      // Los modelos gpt-5 no aceptan temperature.
      modelSettings: {
        maxTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        reasoning: { effort: options.reasoningEffort ?? DEFAULT_REASONING_EFFORT },
      },
    });
    this.#runner = new Runner({
      ...('apiKey' in options.model
        ? { modelProvider: new OpenAIProvider({ apiKey: options.model.apiKey }) }
        : {}),
      tracingDisabled: true,
    });
  }

  /** Configuración efectiva del modelo (para tests y logs). */
  get modelSettings(): { readonly maxTokens?: number; readonly reasoningEffort?: string } {
    const settings = this.#agent.modelSettings;
    return {
      ...(settings.maxTokens === undefined ? {} : { maxTokens: settings.maxTokens }),
      ...(settings.reasoning?.effort ? { reasoningEffort: settings.reasoning.effort } : {}),
    };
  }

  async run(input: {
    readonly memory: readonly unknown[];
    readonly userText: string;
    readonly context: TContext;
  }): Promise<AgentTurnResult> {
    const previous = trimMemory(input.memory, this.options.maxMemoryItems);
    const items: AgentInputItem[] = [...toInputItems(previous), user(input.userText)];
    const runContext = new RunContext<TContext>(input.context);

    try {
      const result = await this.#runner.run(this.#agent, items, {
        context: runContext,
        maxTurns: this.options.maxTurns ?? 8,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
      });
      const text = typeof result.finalOutput === 'string' ? result.finalOutput : undefined;
      const toolCalls = result.newItems.flatMap((item) =>
        item.type === 'tool_call_item' && 'name' in item.rawItem ? [item.rawItem.name] : [],
      );
      return {
        ok: true,
        text: text?.trim() === '' ? undefined : text,
        memory: result.history,
        usage: {
          requests: runContext.usage.requests,
          inputTokens: runContext.usage.inputTokens,
          outputTokens: runContext.usage.outputTokens,
        },
        toolCalls,
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  private toSdkTool(agentTool: AgentTool<TContext>) {
    const { onToolError } = this.options;
    return tool({
      name: agentTool.name,
      description: agentTool.description,
      parameters: agentTool.parameters,
      execute: async (args, runContext?: RunContext<TContext>) => {
        if (!runContext) throw new Error(`Tool ${agentTool.name} ran without a turn context`);
        try {
          return toToolOutput(await agentTool.execute(args, runContext.context));
        } catch (error) {
          onToolError?.(agentTool.name, error);
          throw error;
        }
      },
    });
  }
}

/**
 * La memoria guardada es la que produjo este runner (`result.history`) y se persiste tal cual;
 * se descartan valores que no son objetos por si la fila se editó a mano.
 */
function toInputItems(memory: readonly unknown[]): AgentInputItem[] {
  // El SDK valida cada ítem al enviarlo; acá solo se recupera el tipo perdido al persistir.
  return memory.filter((item) => typeof item === 'object' && item !== null) as AgentInputItem[];
}
