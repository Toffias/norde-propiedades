/**
 * Recorta la memoria a los últimos `maxItems` ítems sin partir un par llamada/resultado de
 * tool: el recorte siempre arranca en un mensaje del usuario (lección del MVP).
 */
export function trimMemory(items: readonly unknown[], maxItems: number): readonly unknown[] {
  if (items.length <= maxItems) return items;

  let start = items.length - maxItems;
  while (start < items.length && !isUserMessage(items[start])) start += 1;
  return items.slice(start);
}

function isUserMessage(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const type = 'type' in item ? item.type : 'message';
  return 'role' in item && item.role === 'user' && type === 'message';
}

/** Resume la salida de una tool de un turno viejo. Recibe el texto que devolvió la tool. */
export type ToolOutputCompactor = (toolName: string, output: string) => string;

/**
 * Achica la memoria que se reenvía en cada turno. Los últimos `fullTurns` turnos quedan
 * completos; en los anteriores:
 * - se quitan los ítems de razonamiento (el modelo no los necesita entre mensajes del usuario);
 * - la salida de cada tool pasa por `compactToolOutput` (por ejemplo, los resultados de una
 *   búsqueda sin la descripción larga).
 */
export function compactMemory(
  items: readonly unknown[],
  options: { readonly fullTurns: number; readonly compactToolOutput?: ToolOutputCompactor },
): readonly unknown[] {
  const userIndexes = items.flatMap((item, index) => (isUserMessage(item) ? [index] : []));
  const fullFrom = userIndexes.at(-options.fullTurns) ?? 0;
  if (fullFrom === 0) return items;

  const names = toolNamesByCallId(items);
  const old = items.slice(0, fullFrom).flatMap((item) => {
    if (!isRecord(item)) return [item];
    if (item.type === 'reasoning') return [];
    if (item.type !== 'function_call_result' || !options.compactToolOutput) return [item];
    const name = typeof item.callId === 'string' ? names.get(item.callId) : undefined;
    const text = outputText(item.output);
    if (name === undefined || text === undefined) return [item];
    return [{ ...item, output: { type: 'text', text: options.compactToolOutput(name, text) } }];
  });
  return [...old, ...items.slice(fullFrom)];
}

function toolNamesByCallId(items: readonly unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const item of items) {
    if (
      isRecord(item) &&
      item.type === 'function_call' &&
      typeof item.callId === 'string' &&
      typeof item.name === 'string'
    ) {
      names.set(item.callId, item.name);
    }
  }
  return names;
}

/** La salida guardada es texto, o `{ type: 'text', text }` según la versión del SDK. */
function outputText(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (isRecord(output) && output.type === 'text' && typeof output.text === 'string') {
    return output.text;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
