import type { ToolOutputCompactor } from '@norde/agent-kit';
import { z } from 'zod';

// Lo que el agente necesita de un turno viejo para seguir la charla ("la 2", "esa de Palermo"):
// número, id, título, precio y link. El resto (superficies, amenities, descripción) se vuelve a
// pedir.
const SummarySchema = z.object({
  number: z.number().optional(),
  id: z.string(),
  title: z.string(),
  price: z.string().optional(),
  url: z.string().optional(),
});

const SearchOutputSchema = z.object({
  total: z.number(),
  page: z.number(),
  items: z.array(SummarySchema),
});

/** Resume las salidas de `search_properties` y `get_property` de los turnos viejos. */
export const compactToolOutput: ToolOutputCompactor = (toolName, output) => {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return output;
  }
  if (toolName === 'search_properties') {
    const search = SearchOutputSchema.safeParse(value);
    if (search.success) return JSON.stringify(search.data);
  }
  if (toolName === 'get_property') {
    const property = SummarySchema.safeParse(value);
    if (property.success) return JSON.stringify(property.data);
  }
  return output;
};
