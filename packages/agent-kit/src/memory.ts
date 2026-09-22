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
