import {
  Agent,
  OpenAIProvider,
  RunContext,
  Runner,
  tool,
  user,
  type AgentInputItem,
  type AgentOutputType,
  type Model,
} from '@openai/agents';
import type { z } from 'zod';

import { toToolOutput, type AgentTool } from './agent-tool';
import { compactMemory, trimMemory, type ToolOutputCompactor } from './memory';
import type { InputModeration } from './moderation';

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
  /** Turnos que la memoria guarda completos; en los anteriores se compacta (ver `compactMemory`). */
  readonly fullMemoryTurns?: number;
  /** Resume la salida de una tool de un turno viejo. Sin esto, solo se quita el razonamiento. */
  readonly compactToolOutput?: ToolOutputCompactor;
  /** Frena el mensaje del usuario antes de llamar al modelo (moderación). */
  readonly moderation?: InputModeration;
  /**
   * Techo de la respuesta completa, **razonamiento incluido**. Con un techo bajo el modelo
   * gasta el presupuesto pensando y termina sin responder (MVP: 700 fallaba siempre).
   */
  readonly maxOutputTokens?: number;
  /** El costo se acota con el esfuerzo de razonamiento, no con el techo de tokens. */
  readonly reasoningEffort?: ReasoningEffort;
  /**
   * Salida estructurada: el turno termina con un objeto que cumple el esquema (en `output`) en
   * lugar de texto. Evita tools que solo marcan cómo responder, y la vuelta extra al modelo que
   * cuesta cada llamada a una tool.
   */
  readonly outputSchema?: z.ZodObject;
  /**
   * Agrupa los pedidos que comparten el mismo prefijo (tools + instrucciones fijas) para que
   * OpenAI los mande al mismo cache. Lo variable de las instrucciones va al final.
   */
  readonly promptCacheKey?: string;
  readonly maxTurns?: number;
  readonly timeoutMs?: number;
  /** Error inesperado dentro de una tool. El modelo recibe un error genérico y sigue. */
  readonly onToolError?: (toolName: string, error: unknown) => void;
}

export interface AgentTurnUsage {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Parte de `inputTokens` que salió del cache de prompts (se cobra más barata). */
  readonly cachedInputTokens: number;
  /** Parte de `outputTokens` que fue razonamiento. */
  readonly reasoningTokens: number;
}

export interface AgentToolCall {
  readonly name: string;
  /** Argumentos que mandó el modelo, ya parseados (o el texto crudo si no eran JSON). */
  readonly arguments: unknown;
}

export type AgentTurnResult =
  | {
      readonly ok: true;
      /** Texto final del modelo. `undefined` si no escribió nada o si la salida es estructurada. */
      readonly text: string | undefined;
      /** Con `outputSchema`: el objeto final, ya validado por el SDK (sin tipo: lo valida la app). */
      readonly output: unknown;
      /** Memoria para guardar: la anterior más este turno completo (compactada). */
      readonly memory: readonly unknown[];
      readonly usage: AgentTurnUsage;
      /** Tools llamadas en el turno, en orden. */
      readonly toolCalls: readonly AgentToolCall[];
      /** La moderación frenó el mensaje: no se llamó al modelo y la memoria no cambió. */
      readonly flagged: boolean;
    }
  | {
      readonly ok: false;
      readonly error: unknown;
    };

export const DEFAULT_MAX_OUTPUT_TOKENS = 3000;
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low';
export const DEFAULT_FULL_MEMORY_TURNS = 2;

const NO_USAGE: AgentTurnUsage = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  reasoningTokens: 0,
};

/**
 * Corre un turno de un agente de IA sobre el OpenAI Agents SDK. Es el único lugar del
 * monorepo que conoce el SDK: las apps definen instrucciones y tools, y guardan la memoria.
 */
export class AgentRunner<TContext> {
  readonly #agent: Agent<TContext, AgentOutputType>;
  readonly #runner: Runner;

  constructor(private readonly options: AgentRunnerOptions<TContext>) {
    const model = 'instance' in options.model ? options.model.instance : options.model.name;
    this.#agent = new Agent<TContext, AgentOutputType>({
      name: options.name,
      model,
      instructions: (runContext) => options.instructions(runContext.context),
      tools: options.tools.map((t) => this.toSdkTool(t)),
      outputType: options.outputSchema ?? 'text',
      // Los modelos gpt-5 no aceptan temperature.
      modelSettings: {
        maxTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        reasoning: { effort: options.reasoningEffort ?? DEFAULT_REASONING_EFFORT },
        // OpenAI no guarda las conversaciones (datos personales, Ley 25.326). Sin `store`, el
        // razonamiento se reenvía cifrado en la memoria en lugar de referenciarse por id.
        store: false,
        providerData: {
          include: ['reasoning.encrypted_content'],
          ...(options.promptCacheKey === undefined
            ? {}
            : { prompt_cache_key: options.promptCacheKey }),
        },
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
  get modelSettings(): {
    readonly maxTokens?: number;
    readonly reasoningEffort?: string;
    readonly promptCacheKey?: string;
    readonly store?: boolean;
  } {
    const settings = this.#agent.modelSettings;
    const cacheKey: unknown = settings.providerData?.prompt_cache_key;
    return {
      ...(settings.maxTokens === undefined ? {} : { maxTokens: settings.maxTokens }),
      ...(settings.reasoning?.effort ? { reasoningEffort: settings.reasoning.effort } : {}),
      ...(typeof cacheKey === 'string' ? { promptCacheKey: cacheKey } : {}),
      ...(settings.store === undefined ? {} : { store: settings.store }),
    };
  }

  async run(input: {
    readonly memory: readonly unknown[];
    readonly userText: string;
    readonly context: TContext;
  }): Promise<AgentTurnResult> {
    const runContext = new RunContext<TContext>(input.context);

    try {
      if (await this.options.moderation?.(input.userText)) {
        return {
          ok: true,
          text: undefined,
          output: undefined,
          memory: input.memory,
          usage: NO_USAGE,
          toolCalls: [],
          flagged: true,
        };
      }
      const previous = this.compact(trimMemory(input.memory, this.options.maxMemoryItems));
      const items: AgentInputItem[] = [...toInputItems(previous), user(input.userText)];
      const result = await this.#runner.run(this.#agent, items, {
        context: runContext,
        maxTurns: this.options.maxTurns ?? 8,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 60_000),
      });
      const text = typeof result.finalOutput === 'string' ? result.finalOutput : undefined;
      const toolCalls = result.newItems.flatMap((item) =>
        item.type === 'tool_call_item' && item.rawItem.type === 'function_call'
          ? [{ name: item.rawItem.name, arguments: parseArguments(item.rawItem.arguments) }]
          : [],
      );
      const { usage } = runContext;
      return {
        ok: true,
        text: text?.trim() === '' ? undefined : text,
        output:
          typeof result.finalOutput === 'object' && result.finalOutput !== null
            ? result.finalOutput
            : undefined,
        memory: this.compact(result.history),
        usage: {
          requests: usage.requests,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedInputTokens: sumDetail(usage.inputTokensDetails, 'cached_tokens'),
          reasoningTokens: sumDetail(usage.outputTokensDetails, 'reasoning_tokens'),
        },
        toolCalls,
        flagged: false,
      };
    } catch (error) {
      return { ok: false, error };
    }
  }

  private compact(memory: readonly unknown[]): readonly unknown[] {
    return compactMemory(memory, {
      fullTurns: this.options.fullMemoryTurns ?? DEFAULT_FULL_MEMORY_TURNS,
      ...(this.options.compactToolOutput
        ? { compactToolOutput: this.options.compactToolOutput }
        : {}),
    });
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

/** Suma un detalle de uso (`cached_tokens`, `reasoning_tokens`) de todos los pedidos del turno. */
function sumDetail(details: readonly Record<string, number>[], key: string): number {
  return details.reduce((total, detail) => total + (detail[key] ?? 0), 0);
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
