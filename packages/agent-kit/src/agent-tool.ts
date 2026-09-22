import type { z } from 'zod';

/**
 * Una herramienta que el modelo puede llamar.
 *
 * - `parameters`: esquema Zod de los argumentos. El modo estricto de OpenAI exige que todos
 *   los campos estén presentes: usar `.nullable()` en lugar de `.optional()`.
 * - `execute`: recibe los argumentos ya validados y el contexto del turno. Devuelve un objeto
 *   que se serializa a JSON para el modelo (los `bigint` se convierten a texto).
 */
export interface AgentTool<TContext, TParams extends z.ZodObject = z.ZodObject> {
  readonly name: string;
  readonly description: string;
  readonly parameters: TParams;
  execute(args: z.infer<TParams>, context: TContext): Promise<unknown>;
}

/** Helper de tipado: infiere los argumentos de `execute` a partir de `parameters`. */
export function defineTool<TContext, TParams extends z.ZodObject>(
  tool: AgentTool<TContext, TParams>,
): AgentTool<TContext, TParams> {
  return tool;
}

/** JSON para el modelo. `bigint` (montos en centavos) no es serializable por defecto. */
export function toToolOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}
